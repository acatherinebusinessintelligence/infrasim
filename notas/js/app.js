const loginView = document.querySelector("#loginView");
const statusView = document.querySelector("#statusView");
const statusTitle = document.querySelector("#statusTitle");
const statusMessage = document.querySelector("#statusMessage");
const resultView = document.querySelector("#resultView");

document.addEventListener("DOMContentLoaded", () => {
  loginView.addEventListener("submit", handleLogin);
});

async function handleLogin(event) {
  event.preventDefault();
  const button = loginView.querySelector("button");
  button.disabled = true;
  try {
    await loginNotas(
      document.querySelector("#email").value,
      document.querySelector("#accessCode").value
    );
    const payload = await fetchNotasResultado();
    if (payload.status === "pendiente") {
      renderPendiente(payload);
      return;
    }
    renderResult(payload);
  } catch (error) {
    renderUnavailable(error.message || "No fue posible completar la operación. Intenta nuevamente.");
  } finally {
    button.disabled = false;
  }
}

function renderUnavailable(message) {
  loginView.hidden = false;
  statusView.hidden = false;
  resultView.hidden = true;
  statusTitle.textContent = "Acceso no disponible";
  statusMessage.textContent = message;
  statusMessage.className = "error";
}

function renderPendiente(payload) {
  loginView.hidden = true;
  statusView.hidden = false;
  resultView.hidden = true;
  statusMessage.className = "";
  statusTitle.textContent = payload.estudiante || "Resultado";
  const lugar = [payload.nrc, payload.grupo].filter(Boolean).join(" · ");
  statusMessage.textContent = lugar
    ? `${lugar}. ${payload.mensaje || "Tu nota definitiva de este corte aún no ha sido registrada."}`
    : (payload.mensaje || "Tu nota definitiva de este corte aún no ha sido registrada.");
}

function renderResult(payload) {
  loginView.hidden = true;
  statusView.hidden = false;
  statusMessage.className = "";
  statusTitle.textContent = payload.estudiante || "Resultado";
  statusMessage.textContent = `NRC ${payload.nrc || ""} · ${payload.grupo || ""}`;
  const simulation = payload.usa_simulacion ? (payload.simulacion_5 ?? "—") : "No aplica";
  const originWhy = payload.metodo_seleccion === "automatico_mejor_opcion"
    ? "se eligió el escenario con la nota final más alta"
    : payload.metodo_seleccion === "manual"
      ? "ajuste registrado por la docente"
      : "";
  resultView.hidden = false;
  resultView.innerHTML = `
    <div class="result-grid">
      <div><span>Taller /5</span><strong>${escapeHtml(payload.taller_5)}</strong></div>
      <div><span>Caso /5</span><strong>${escapeHtml(payload.caso_5)}</strong></div>
      <div><span>Parcial /5</span><strong>${escapeHtml(payload.parcial_5)}</strong></div>
      <div><span>Simulación /5</span><strong>${escapeHtml(simulation)}</strong></div>
    </div>
    <p><strong>Nota final definitiva:</strong> ${escapeHtml(payload.nota_final_definitiva ?? "Pendiente")}</p>
    <p>Origen de simulación: ${escapeHtml(payload.origen_elegido || "No aplica")}. ${escapeHtml(originWhy)}.</p>
    ${payload.nota_escenario_parcial != null ? `<p>Escenario Parcial: ${escapeHtml(payload.nota_escenario_parcial)}. Escenario Caso: ${escapeHtml(payload.nota_escenario_caso)}.</p>` : ""}
    <h3>Retroalimentación del caso</h3>
    <div class="feedback-block">${escapeHtml(payload.retroalimentacion_amplia || "Aún no hay retroalimentación disponible.")}</div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}
