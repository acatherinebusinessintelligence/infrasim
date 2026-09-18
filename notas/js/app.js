const loginView = document.querySelector("#loginView");
const statusView = document.querySelector("#statusView");
const statusTitle = document.querySelector("#statusTitle");
const statusMessage = document.querySelector("#statusMessage");
const resultView = document.querySelector("#resultView");

let corteChart = null;
let rubricaChart = null;

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

// Umbral de color compartido por las dos graficas: rojo < 3/5 (60%), amarillo 3-4/5 (60-80%), verde >= 4/5 (80%)
function colorForRatio(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return "#c7d1d8";
  if (ratio < 0.6) return "#c0392b";
  if (ratio < 0.8) return "#d9a441";
  return "#1f8b5a";
}

function buildCorteChart(payload) {
  const canvas = document.querySelector("#corteChart");
  if (!canvas || typeof Chart === "undefined") return;

  const labels = ["Taller", "Caso", "Parcial"];
  const values = [payload.taller_5, payload.caso_5, payload.parcial_5];
  if (payload.usa_simulacion) {
    labels.push("Simulación");
    values.push(payload.simulacion_5);
  }
  const colors = values.map((v) => colorForRatio(v == null ? null : v / 5));

  if (corteChart) corteChart.destroy();
  corteChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        maxBarThickness: 56,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: (ctx) => `${ctx.formattedValue} / 5`,
      } } },
      scales: {
        y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } },
      },
    },
  });
}

const RUBRICA_CRITERIOS = [
  { key: "rubrica_aplicacion", label: "Comprensión y aplicación conceptual" },
  { key: "rubrica_analisis", label: "Representación y análisis técnico AS-IS" },
  { key: "rubrica_optimizacion", label: "Medición y diagnóstico técnico" },
  { key: "rubrica_bibliografia", label: "Bibliografía, normativa y gobierno TI" },
  { key: "rubrica_ia", label: "Uso crítico, ético y transparente de IA" },
  { key: "rubrica_presentacion", label: "Comunicación y presentación profesional" },
];

function buildRubricaChart(payload) {
  const canvas = document.querySelector("#rubricaChart");
  if (!canvas || typeof Chart === "undefined") return null;

  const items = RUBRICA_CRITERIOS
    .map((c) => {
      const valor = payload[c.key];
      const maximo = payload[`${c.key}_max`];
      if (valor == null || maximo == null) return null;
      return { label: c.label, valor, maximo, ratio: valor / maximo };
    })
    .filter(Boolean)
    .sort((a, b) => a.ratio - b.ratio);

  if (items.length === 0) {
    canvas.closest(".rubrica-block").hidden = true;
    return null;
  }

  const colors = items.map((it) => colorForRatio(it.ratio));

  if (rubricaChart) rubricaChart.destroy();
  rubricaChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: items.map((it) => it.label),
      datasets: [{
        data: items.map((it) => Math.round(it.ratio * 1000) / 10),
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: (ctx) => {
            const it = items[ctx.dataIndex];
            return `${it.valor} / ${it.maximo} puntos (${ctx.formattedValue}%)`;
          },
        } },
      },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
      },
    },
  });

  return items[0]; // el de menor porcentaje: el punto mas importante a mejorar
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
    <div class="chart-block">
      <h3>Resumen visual del corte</h3>
      <p class="chart-block__note">Cada barra es tu nota /5 en ese componente. Verde: buen desempeño. Amarillo: aceptable, con espacio de mejora. Rojo: el punto que más te conviene reforzar.</p>
      <div class="chart-wrap chart-wrap--corte"><canvas id="corteChart"></canvas></div>
    </div>

    <div class="result-grid">${metricsHtml}</div>

    <div class="final-grade">
      <span class="final-grade__label">Nota final definitiva</span>
      <strong class="final-grade__value">${escapeHtml(payload.nota_final_definitiva ?? "Pendiente")}</strong>
    </div>

    ${scenarioHtml}

    <div class="rubrica-block chart-block">
      <h3>Desglose del Caso por criterio</h3>
      <p class="chart-block__note">Porcentaje logrado sobre el máximo de cada criterio de la rúbrica, ordenado del más débil al más fuerte.</p>
      <div class="chart-wrap chart-wrap--rubrica"><canvas id="rubricaChart"></canvas></div>
      <p id="rubricaHighlight" class="rubrica-highlight"></p>
    </div>

    <h3>Retroalimentación del caso</h3>
    <div class="feedback-block">${escapeHtml(payload.retroalimentacion_amplia || "Aún no hay retroalimentación disponible.")}</div>
  `;

  buildCorteChart(payload);
  const peor = buildRubricaChart(payload);
  const highlight = document.querySelector("#rubricaHighlight");
  if (highlight) {
    if (peor) {
      const pct = Math.round(peor.ratio * 100);
      highlight.textContent = `Tu punto más importante para mejorar en el Caso: "${peor.label}" (${pct}% del máximo). Revisa la retroalimentación completa abajo para ver el detalle.`;
    } else {
      highlight.textContent = "";
    }
  }
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
