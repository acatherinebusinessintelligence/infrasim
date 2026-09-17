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

// Pesos fijos del modelo de ponderación (Taller siempre 10%).
// Si usa simulación, el 10% se toma del Parcial (por defecto) o del Caso (si así se eligió).
function scenarioWeights(origin) {
  if (origin === "Caso") {
    return { taller: 10, caso: 40, parcial: 40, simulacion: 10 };
  }
  return { taller: 10, caso: 50, parcial: 30, simulacion: 10 };
}

function noSimulationWeights() {
  return { taller: 10, caso: 50, parcial: 40, simulacion: 0 };
}

function formatWeights(w) {
  const parts = [`Taller ${w.taller}%`, `Caso ${w.caso}%`, `Parcial ${w.parcial}%`];
  if (w.simulacion > 0) parts.push(`Simulación ${w.simulacion}%`);
  return parts.join(" · ");
}

function scenarioCardHtml(label, weights, nota, isChosen) {
  const notaTexto = nota == null ? "—" : escapeHtml(nota);
  return `
    <div class="scenario-card${isChosen ? " scenario-card--chosen" : ""}">
      ${isChosen ? '<span class="scenario-card__badge">Nota aplicada</span>' : ""}
      <p class="scenario-card__label">${escapeHtml(label)}</p>
      <p class="scenario-card__weights">${escapeHtml(formatWeights(weights))}</p>
      <p class="scenario-card__score">${notaTexto}</p>
    </div>
  `;
}

function metricHtml(label, value) {
  return `
    <div class="metric">
      <span class="metric__label">${escapeHtml(label)}</span>
      <strong class="metric__value">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderResult(payload) {
  loginView.hidden = true;
  statusView.hidden = false;
  statusMessage.className = "";
  statusTitle.textContent = payload.estudiante || "Resultado";
  statusMessage.textContent = `NRC ${payload.nrc || ""} · ${payload.grupo || ""}`;

  const usaSimulacion = Boolean(payload.usa_simulacion);
  const simulationValue = usaSimulacion ? (payload.simulacion_5 ?? "—") : "No aplica";

  const metricsHtml = [
    metricHtml("Taller /5", payload.taller_5),
    metricHtml("Caso /5", payload.caso_5),
    metricHtml("Parcial /5", payload.parcial_5),
    metricHtml("Simulación /5", simulationValue),
  ].join("");

  let scenarioHtml = "";
  if (usaSimulacion && payload.nota_escenario_parcial != null && payload.nota_escenario_caso != null) {
    const origen = payload.origen_elegido || "Parcial";
    const explicacion = payload.metodo_seleccion === "automatico_mejor_opcion"
      ? "El sistema comparó las dos formas de aplicar el 10% de la simulación y aplicó automáticamente la que te da la nota más alta."
      : payload.metodo_seleccion === "manual"
        ? "La docente ajustó manualmente cuál de las dos opciones se aplica."
        : "";
    scenarioHtml = `
      <div class="scenario-compare">
        <h3>¿Cómo se aplicó el 10% de la simulación?</h3>
        ${explicacion ? `<p class="scenario-compare__note">${escapeHtml(explicacion)}</p>` : ""}
        <div class="scenario-grid">
          ${scenarioCardHtml("Sumado al Parcial", scenarioWeights("Parcial"), payload.nota_escenario_parcial, origen === "Parcial")}
          ${scenarioCardHtml("Sumado al Caso", scenarioWeights("Caso"), payload.nota_escenario_caso, origen === "Caso")}
        </div>
      </div>
    `;
  } else if (!usaSimulacion) {
    const w = noSimulationWeights();
    scenarioHtml = `
      <div class="scenario-compare">
        <h3>Ponderación aplicada</h3>
        <p class="scenario-compare__note">Este corte no incluyó simulación para ti.</p>
        <p class="scenario-compare__weights-only">${escapeHtml(formatWeights(w))}</p>
      </div>
    `;
  }

  resultView.hidden = false;
  resultView.innerHTML = `
    <div class="result-grid">${metricsHtml}</div>
    <div class="final-grade">
      <span class="final-grade__label">Nota final definitiva</span>
      <strong class="final-grade__value">${escapeHtml(payload.nota_final_definitiva ?? "Pendiente")}</strong>
    </div>
    ${scenarioHtml}
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
