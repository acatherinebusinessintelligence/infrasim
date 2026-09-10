const ExamIntegrity = (() => {
  const DEBOUNCE_MS = 1200;
  const RELOAD_MARKER = "infrasim_exam_in_progress";
  const RELOAD_REPORTED = "infrasim_exam_reload_reported";
  const SHORTCUT_EVENTS = {
    c: "COPY_ATTEMPT",
    x: "CUT_ATTEMPT",
    v: "PASTE_ATTEMPT",
    p: "PRINT_ATTEMPT",
  };

  let active = false;
  let recordEvent = null;
  let onWarning = null;
  let warningCount = 0;
  const lastSentAt = {};

  function install(options = {}) {
    recordEvent = options.recordEvent;
    onWarning = options.onWarning;
  }

  function activate() {
    if (active) return;
    active = true;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("beforeprint", handleBeforePrint);
  }

  function deactivate() {
    if (!active) return;
    active = false;
    clearReloadMarker();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleBlur);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    document.removeEventListener("contextmenu", handleContextMenu);
    document.removeEventListener("copy", handleCopy);
    document.removeEventListener("cut", handleCut);
    document.removeEventListener("paste", handlePaste);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("beforeprint", handleBeforePrint);
  }

  async function requestFullscreen() {
    const target = document.documentElement;
    if (!target.requestFullscreen) {
      await send("FULLSCREEN_UNSUPPORTED", "fullscreen");
      warn("El modo pantalla completa no esta disponible en este navegador.", true);
      return {ok: true, unsupported: true};
    }
    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      }
      return {ok: true, unsupported: false};
    } catch (error) {
      warn("Debes permitir pantalla completa para iniciar o continuar el examen.", true);
      return {ok: false, unsupported: false};
    }
  }

  function consumeReloadMarker() {
    if (sessionStorage.getItem(RELOAD_MARKER) !== "1") return false;
    if (sessionStorage.getItem(RELOAD_REPORTED) === "1") return false;
    sessionStorage.setItem(RELOAD_REPORTED, "1");
    return true;
  }

  function markInProgressForReload() {
    sessionStorage.setItem(RELOAD_MARKER, "1");
  }

  function clearReloadMarker() {
    sessionStorage.removeItem(RELOAD_MARKER);
    sessionStorage.removeItem(RELOAD_REPORTED);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      send("TAB_HIDDEN", "visibilitychange");
      warn("Se detecto cambio de pestana o minimizacion durante el examen.", false);
    }
  }

  function handleBlur() {
    send("WINDOW_BLUR", "window-blur");
    warn("La ventana del examen perdio el foco.", false);
  }

  function handleFullscreenChange() {
    if (active && !document.fullscreenElement) {
      send("FULLSCREEN_EXIT", "fullscreenchange");
      warn("Saliste del modo pantalla completa.", true);
    }
  }

  function handleContextMenu(event) {
    event.preventDefault();
    send("CONTEXT_MENU", "contextmenu");
    warn("El menu contextual esta deshabilitado durante el examen.", false);
  }

  function handleCopy(event) {
    event.preventDefault();
    send("COPY_ATTEMPT", "copy");
    warn("Copiar contenido esta deshabilitado durante el examen.", false);
  }

  function handleCut(event) {
    event.preventDefault();
    send("CUT_ATTEMPT", "cut");
    warn("Cortar contenido esta deshabilitado durante el examen.", false);
  }

  function handlePaste(event) {
    event.preventDefault();
    send("PASTE_ATTEMPT", "paste");
    warn("Pegar contenido esta deshabilitado durante el examen.", false);
  }

  function handleKeydown(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    const eventType = SHORTCUT_EVENTS[String(event.key || "").toLowerCase()];
    if (!eventType) return;
    event.preventDefault();
    send(eventType, "keyboard-shortcut");
    warn("Ese atajo esta deshabilitado durante el examen.", eventType === "PRINT_ATTEMPT");
  }

  function handleBeforePrint(event) {
    if (event.preventDefault) event.preventDefault();
    send("PRINT_ATTEMPT", "beforeprint");
    warn("La impresion esta deshabilitada durante el examen.", false);
  }

  async function send(eventType, source) {
    if (!active && eventType !== "FULLSCREEN_UNSUPPORTED") return;
    if (typeof recordEvent !== "function") return;
    const now = Date.now();
    if (lastSentAt[eventType] && now - lastSentAt[eventType] < DEBOUNCE_MS) return;
    lastSentAt[eventType] = now;
    try {
      await recordEvent(eventType, metadata(source));
    } catch (error) {
      return;
    }
  }

  function metadata(source) {
    return {
      fullscreen_active: Boolean(document.fullscreenElement),
      document_hidden: Boolean(document.hidden),
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      event_source: source,
    };
  }

  function warn(message, showFullscreenButton) {
    warningCount += 1;
    if (typeof onWarning !== "function") return;
    const title = warningCount === 1
      ? "ADVERTENCIA"
      : warningCount === 2
        ? "SEGUNDA ADVERTENCIA"
        : "ADVERTENCIA DE INTEGRIDAD";
    onWarning({title, message, showFullscreenButton});
  }

  return {
    activate,
    clearReloadMarker,
    consumeReloadMarker,
    deactivate,
    install,
    markInProgressForReload,
    requestFullscreen,
  };
})();
