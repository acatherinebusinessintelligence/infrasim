const ALLOW_REDRAW = true;
let archetypeNames = [];
let currentScenario = null;
let currentQuiz = null;
let currentQuestionIndex = 0;
let quizAnswers = {};
let latestResult = null;
let historyCache = [];
let quizSubmitting = false;

document.addEventListener("DOMContentLoaded", async () => {
  bindLearningNavigation();

  try {
    const archetypes = await fetchArchetypes();
    archetypeNames = archetypes.map((archetype) => archetype.name);
  } catch (error) {
    archetypeNames = ["Hospital conectado", "Universidad digital", "Fintech 24/7", "Retail con demanda pico"];
  }

  document.querySelector("#draw-button").addEventListener("click", handleDrawCase);

  if (getSessionToken()) {
    try {
      await openDashboard();
    } catch (error) {
      clearSessionToken();
      showView("login");
    }
  } else {
    showView("login");
  }
});

async function handleDrawCase() {
  const button = document.querySelector("#draw-button");
  const drawPanel = document.querySelector("#draw-panel");
  const casePanel = document.querySelector("#case-panel");
  const roulette = document.querySelector("#roulette");
  const result = document.querySelector("#draw-result");

  button.disabled = true;
  drawPanel.hidden = false;
  casePanel.hidden = true;
  result.innerHTML = "";
  roulette.textContent = "Sorteando caso...";

  try {
    const payload = await drawScenario();
    const scenario = payload.scenario;
    currentScenario = scenario;
    const finalName = scenario.organization.name.replace(/^(Nova|Andes|Central|Origen|Atlas|Nexo)\s/, "");

    await animateRoulette(finalName);
    renderDrawResult(scenario, finalName);
    document.querySelector("#case-panel").hidden = false;
    renderScenario(scenario);
  } catch (error) {
    roulette.textContent = "No fue posible completar el sorteo.";
    result.innerHTML = `<div class="form-message">${friendlyMessage(error)}</div>`;
  } finally {
    button.disabled = false;
  }
}

function animateRoulette(finalName) {
  const roulette = document.querySelector("#roulette");
  const names = archetypeNames.length > 0 ? archetypeNames : [finalName];
  let index = 0;
  let delay = 60;
  let elapsed = 0;

  return new Promise((resolve) => {
    function tick() {
      roulette.textContent = names[index % names.length];
      index += 1;
      elapsed += delay;
      delay += 18;

      if (elapsed >= 1900) {
        roulette.textContent = finalName;
        resolve();
        return;
      }

      setTimeout(tick, delay);
    }

    tick();
  });
}

function renderDrawResult(scenario, archetypeName) {
  const organization = scenario.organization;
  const container = document.querySelector("#draw-result");

  container.innerHTML = `
    <article class="draw-card">
      <p class="eyebrow">TU CASO</p>
      <h2>${archetypeName}</h2>
      <dl class="detail-grid">
        ${detail("Sector", organization.sector_label)}
        ${detail("Tamaño", organization.size)}
        ${detail("Operación", organization.locations)}
        ${detail("Usuarios", organization.users)}
      </dl>
      <div class="action-row">
        <button id="start-exam" type="button" class="primary-action">INICIAR SIMULACRO</button>
        ${ALLOW_REDRAW ? '<button id="draw-again" type="button" class="secondary-action">SORTEAR OTRO CASO</button>' : ""}
      </div>
    </article>
  `;

  document.querySelector("#start-exam").addEventListener("click", () => {
    startQuiz(scenario);
  });

  const drawAgain = document.querySelector("#draw-again");
  if (drawAgain) {
    drawAgain.addEventListener("click", handleDrawCase);
  }
}

async function startQuiz(scenario) {
  if (!scenario || !scenario.scenario_id) {
    document.querySelector("#draw-result").insertAdjacentHTML(
      "beforeend",
      `<div class="form-message">Primero debes sortear y leer un caso.</div>`
    );
    return;
  }

  const quizPanel = document.querySelector("#quiz-panel");
  document.querySelector("#case-panel").hidden = false;

  try {
    currentQuiz = await generateQuiz(scenario.scenario_id);
    currentQuestionIndex = 0;
    quizAnswers = {};
    quizPanel.hidden = false;
    renderQuestion();
    quizPanel.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    document.querySelector("#draw-result").insertAdjacentHTML(
      "beforeend",
      `<div class="form-message">${friendlyMessage(error)}</div>`
    );
  }
}

function renderQuestion() {
  const question = currentQuiz.questions[currentQuestionIndex];
  const progress = document.querySelector("#quiz-progress");
  const fill = document.querySelector("#quiz-progress-fill");
  const view = document.querySelector("#question-view");
  const previous = document.querySelector("#prev-question");
  const next = document.querySelector("#next-question");
  const finish = document.querySelector("#finish-quiz");

  progress.textContent = `${question.number} / ${currentQuiz.questions.length}`;
  fill.style.width = `${(question.number / currentQuiz.questions.length) * 100}%`;
  previous.disabled = currentQuestionIndex === 0;
  next.hidden = currentQuestionIndex === currentQuiz.questions.length - 1;
  finish.hidden = currentQuestionIndex !== currentQuiz.questions.length - 1;

  view.innerHTML = `
    <article class="question-card">
      <span class="tag">${formatCompetency(question.competency)}</span>
      <h3>Pregunta ${question.number} de 10</h3>
      <p>${question.prompt}</p>
      ${renderAnswerControl(question)}
    </article>
  `;

  bindQuestionControls(question);
}

function renderAnswerControl(question) {
  const saved = quizAnswers[question.id] || "";

  if (question.type === "numeric_input") {
    return `<input class="answer-input" type="text" inputmode="decimal" name="${question.id}" value="${saved}" placeholder="Escribe tu respuesta numerica">`;
  }

  if (question.type === "short_input") {
    return `<textarea class="answer-input" name="${question.id}" rows="4" placeholder="Escribe una respuesta breve">${saved}</textarea>`;
  }

  return `
    <div class="answer-options">
      ${question.options.map((option) => `
        <label class="answer-option">
          <input type="radio" name="${question.id}" value="${option.id}" ${saved === option.id ? "checked" : ""}>
          <span>${option.text}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function bindQuestionControls(question) {
  document.querySelectorAll(`[name="${question.id}"]`).forEach((control) => {
    control.addEventListener("input", () => {
      quizAnswers[question.id] = control.value;
    });
    control.addEventListener("change", () => {
      quizAnswers[question.id] = control.value;
    });
  });
}

document.addEventListener("click", async (event) => {
  if (!currentQuiz) {
    return;
  }

  if (event.target.id === "prev-question") {
    currentQuestionIndex = Math.max(0, currentQuestionIndex - 1);
    renderQuestion();
  }

  if (event.target.id === "next-question") {
    currentQuestionIndex = Math.min(currentQuiz.questions.length - 1, currentQuestionIndex + 1);
    renderQuestion();
  }

  if (event.target.id === "finish-quiz") {
    if (!currentQuiz || quizSubmitting) {
      return;
    }
    const confirmed = window.confirm("Deseas entregar tus respuestas?");
    if (!confirmed) {
      return;
    }

    quizSubmitting = true;
    try {
      const result = await finishQuiz(currentQuiz.quiz_id, quizAnswers);
      latestResult = result;
      currentQuiz = null;
      renderLearningResult(result);
      showView("result");
    } catch (error) {
      await handleSessionError(error);
      document.querySelector("#question-view").insertAdjacentHTML(
        "beforeend",
        `<div class="form-message">${friendlyMessage(error)}</div>`
      );
    } finally {
      quizSubmitting = false;
    }
  }
});

function renderLearningResult(result) {
  const panel = document.querySelector("#result-output");
  const feedback = result.feedback || {};
  panel.innerHTML = `
    <article class="result-card featured-card">
      <p class="eyebrow">RESULTADO DEL SIMULACRO</p>
      <h2>${result.correct} / ${result.total}</h2>
      <p class="score-line">${result.score} %</p>
      <p class="performance-label">${result.performance_label || ""}</p>
      ${renderMeter(result.score)}
      <p class="disclaimer">${result.disclaimer || "Este resultado es un indicador de aprendizaje y no corresponde a una nota oficial."}</p>
      ${renderSimulacrumCode(result.seed)}
    </article>
    ${renderCompetencyResults(result.competencies, feedback.by_competency)}
    ${renderTextList("Qué hiciste bien", feedback.what_went_well)}
    ${renderTextList("Qué debes reforzar", feedback.what_to_reinforce)}
    ${renderRecommendations(result.recommendations, "Te recomendamos reforzar")}
    ${renderConceptCards(result.recommendations, "Conceptos relacionados")}
    <div class="action-row">
      <button id="result-to-dashboard" type="button" class="primary-action">VER PANEL</button>
      <button id="result-to-history" type="button" class="secondary-action">VER HISTORIAL</button>
      <button id="result-new-sim" type="button" class="secondary-action">REALIZAR NUEVO SIMULACRO</button>
    </div>
  `;
  document.querySelector("#result-to-dashboard").addEventListener("click", () => openDashboard());
  document.querySelector("#result-to-history").addEventListener("click", () => openHistory());
  document.querySelector("#result-new-sim").addEventListener("click", startNewSimulation);
}

function renderCompetencyResults(competencies, detailed) {
  const items = detailed && detailed.length
    ? detailed
    : Object.entries(competencies || {}).map(([name, result]) => ({
      competency: name,
      label: formatCompetency(name),
      correct: result.correct,
      total: result.total,
      percentage: result.percentage,
      message: "",
    }));

  return `
    <article class="result-card">
      <h3>Desempeño por competencia</h3>
      <div class="result-list">
        ${items.map((item) => `
          <div class="result-item">
            <strong>${item.label || formatCompetency(item.competency)}</strong>
            <p>${item.correct} / ${item.total} · ${item.percentage ?? ""} %</p>
            ${renderMeter(item.percentage)}
            ${item.performance_label ? `<p>${item.performance_label}</p>` : ""}
            ${item.message ? `<p>${item.message}</p>` : ""}
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function formatCompetency(value) {
  return {
    comprender: "Comprender",
    representar_spof: "Representar / SPOF",
    medir: "Medir",
    diagnosticar: "Diagnosticar",
    itil: "ITIL",
    cobit: "COBIT",
    iso27001: "ISO 27001",
    decidir: "Decidir",
  }[value] || value;
}

function renderScenario(scenario) {
  const output = document.querySelector("#scenario-output");
  output.innerHTML = `
    ${renderContext(scenario)}
    ${renderOrganization(scenario)}
    ${renderServices(scenario.services)}
    ${renderInfrastructure(scenario.infrastructure)}
    ${renderDependencies(scenario.dependencies)}
    ${renderSpof(scenario.potential_spof)}
    ${renderStorage(scenario.storage)}
    ${renderBackup(scenario.backup)}
    ${renderNetwork(scenario.network)}
    ${renderSecurity(scenario.security)}
    ${renderOperations(scenario.operations)}
    ${renderEvidence(scenario.evidence_profile)}
    ${renderOperationalData(scenario.operational_data)}
    ${renderIncidents(scenario.incidents)}
    ${renderConstraints(scenario.constraints)}
  `;
}

function renderContext(scenario) {
  return `
    <article class="result-card featured-card">
      <h3>Contexto</h3>
      <p>${scenario.organization.name} opera en el sector ${scenario.organization.sector_label.toLowerCase()} con un perfil de ${scenario.organization.operation_profile}.</p>
    </article>
  `;
}

function renderOrganization(scenario) {
  const organization = scenario.organization;

  return renderDetails("Organización", {
    Nombre: organization.name,
    Sector: organization.sector_label,
    Tamaño: organization.size,
    Sedes: organization.locations,
    Usuarios: organization.users,
    Empleados: organization.employees,
    Operación: organization.operation_profile,
  });
}

function renderServices(services) {
  return `
    <article class="result-card">
      <h3>Servicios tecnológicos</h3>
      <div class="result-list">
        ${services.map((service) => `
          <div class="result-item">
            <strong>${service.name}</strong>
            <span class="tag criticality-${service.criticality}">${service.criticality}</span>
            <p>${service.operation_required}</p>
            <small>${service.users}</small>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderInfrastructure(items) {
  return `
    <article class="result-card">
      <h3>Infraestructura</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Componente</th>
              <th>Tipo</th>
              <th>Función</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Plataforma</th>
              <th>Instancia única</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td>${item.name}</td>
                <td>${item.type}</td>
                <td>${item.function}</td>
                <td>${formatValue(item.cpu_vcpu)}</td>
                <td>${formatValue(item.ram_gb)} GB</td>
                <td>${item.platform}</td>
                <td>${item.single_instance ? "Sí" : "No"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderDependencies(dependencies) {
  return renderSimpleTable("Dependencias", dependencies, ["source", "target", "type"]);
}

function renderSpof(spofs) {
  return `
    <article class="result-card warning-card">
      <h3>SPOF potenciales</h3>
      <div class="result-list">
        ${spofs.map((spof) => `
          <div class="result-item warning-item">
            <strong>${spof.component}</strong>
            <p>${spof.reason}</p>
          </div>
        `).join("") || "<p>Sin SPOF potenciales relevantes para este caso.</p>"}
      </div>
    </article>
  `;
}

function renderStorage(storage) {
  return renderDetails("Almacenamiento", {
    Tipo: storage.type,
    "Capacidad TB": storage.capacity_tb,
    "Uso TB": storage.used_tb,
    "Crecimiento mensual GB": storage.monthly_growth_gb,
  });
}

function renderBackup(backup) {
  return renderDetails("Backup", {
    Frecuencia: backup.frequency,
    "Copia externa": backup.external_copy ? "Sí" : "No",
    "Pruebas de restauración": backup.restore_tests,
    Monitoreo: backup.monitoring,
  });
}

function renderNetwork(network) {
  return renderDetails("Red", {
    "Enlaces a internet": network.internet_links,
    Firewalls: network.firewalls,
    VPN: network.vpn ? "Sí" : "No",
    Segmentación: network.segmentation,
    "Conectividad distribuida": network.distributed_connectivity ? "Sí" : "No",
  });
}

function renderSecurity(security) {
  return renderDetails("Seguridad", {
    MFA: security.mfa,
    "Cuentas compartidas": security.shared_accounts ? "Sí" : "No",
    "Cuentas inactivas posibles": security.inactive_accounts_possible ? "Sí" : "No",
    Parches: security.patching,
    "Logs centralizados": security.centralized_logs ? "Sí" : "No",
  });
}

function renderOperations(operations) {
  return renderDetails("Operación", {
    Tickets: operations.ticketing,
    Monitoreo: operations.monitoring,
    "Gestión de cambios": operations.change_management,
    SLA: operations.sla,
    "Gestión de capacidad": operations.capacity_management,
  });
}

function renderEvidence(evidence) {
  return renderDetails("Evidencia disponible", {
    Disponibilidad: evidence.availability_history,
    Incidentes: evidence.incident_history,
    "Tiempos de incidentes": evidence.incident_timestamps,
    Latencia: evidence.latency_history,
    Capacidad: evidence.capacity_history,
    Backup: evidence.backup_history,
  });
}

function renderOperationalData(data) {
  return renderDetails("Información operacional", {
    "Periodo observado": `${formatValue(data.observation_period_hours)} horas`,
    "Horas de indisponibilidad": data.downtime_hours,
    "Número de incidentes": data.incident_count,
    "Horas totales de recuperación": data.total_recovery_hours,
    "CPU promedio": formatPercent(data.cpu_average_pct),
    "CPU pico": formatPercent(data.cpu_peak_pct),
    "RAM promedio": formatPercent(data.ram_average_pct),
    "Latencia promedio": formatMs(data.latency_average_ms),
    "Latencia pico": formatMs(data.latency_peak_ms),
    "Usuarios concurrentes promedio": data.concurrent_users_average,
    "Usuarios concurrentes pico": data.concurrent_users_peak,
  });
}

function renderIncidents(incidents) {
  return `
    <article class="result-card">
      <h3>Incidentes</h3>
      <div class="result-list">
        ${incidents.map((incident) => `
          <div class="result-item">
            <strong>${incident.title}</strong>
            <p>${incident.description}</p>
            <small>Duración: ${formatValue(incident.duration_hours)} horas</small>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderConstraints(constraints) {
  return `
    <article class="result-card">
      <h3>Restricciones</h3>
      <ul class="constraint-list">
        ${constraints.map((constraint) => `<li>${constraint}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderDetails(title, values) {
  return `
    <article class="result-card">
      <h3>${title}</h3>
      <dl class="detail-grid">
        ${Object.entries(values).map(([label, value]) => detail(label, value)).join("")}
      </dl>
    </article>
  `;
}

function renderSimpleTable(title, rows, fields) {
  return `
    <article class="result-card">
      <h3>${title}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${fields.map((field) => `<th>${field}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>${fields.map((field) => `<td>${formatValue(row[field])}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function detail(label, value) {
  return `
    <div>
      <dt>${label}</dt>
      <dd>${formatValue(value)}</dd>
    </div>
  `;
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Dato no disponible";
  }

  if (typeof value === "string") {
    return value.replaceAll("_", " ");
  }

  return value;
}

function formatPercent(value) {
  return value === null || value === undefined ? "Dato no disponible" : `${value}%`;
}

function formatMs(value) {
  return value === null || value === undefined ? "Dato no disponible" : `${value} ms`;
}

function bindLearningNavigation() {
  document.querySelector("#login-form").addEventListener("submit", handleLogin);
  document.querySelector("#nav-dashboard").addEventListener("click", () => openDashboard());
  document.querySelector("#nav-history").addEventListener("click", () => openHistory());
  document.querySelector("#logout-button").addEventListener("click", handleLogout);
}

function showView(name) {
  ["login", "dashboard", "simulator", "result", "history"].forEach((view) => {
    const element = document.querySelector(`#view-${view}`);
    if (element) {
      element.hidden = view !== name;
    }
  });
  document.querySelector("#app-header").hidden = name === "login";
}

async function handleLogin(event) {
  event.preventDefault();
  const input = document.querySelector("#login-email");
  const message = document.querySelector("#login-message");
  const email = input.value.trim();
  message.textContent = "";

  if (!email) {
    message.textContent = "El correo es obligatorio.";
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.textContent = "Ingresa un correo con formato valido.";
    return;
  }

  try {
    await loginStudent(email);
    await openDashboard();
  } catch (error) {
    message.textContent = friendlyMessage(error);
  }
}

async function handleLogout() {
  try {
    await logoutStudent();
  } catch (error) {
    clearSessionToken();
  }
  latestResult = null;
  historyCache = [];
  currentScenario = null;
  currentQuiz = null;
  quizAnswers = {};
  quizSubmitting = false;
  showView("login");
}

async function openDashboard() {
  try {
    const [dashboard, competencies] = await Promise.all([
      fetchStudentDashboard(),
      fetchStudentCompetencies(),
    ]);
    renderDashboard(dashboard, competencies);
    showView("dashboard");
  } catch (error) {
    await handleSessionError(error);
  }
}

async function openHistory() {
  try {
    const history = await fetchStudentHistory();
    historyCache = history.attempts || [];
    renderHistory(historyCache);
    showView("history");
  } catch (error) {
    await handleSessionError(error);
  }
}

function startNewSimulation() {
  currentScenario = null;
  currentQuiz = null;
  quizAnswers = {};
  currentQuestionIndex = 0;
  quizSubmitting = false;
  document.querySelector("#draw-panel").hidden = true;
  document.querySelector("#case-panel").hidden = true;
  document.querySelector("#quiz-panel").hidden = true;
  document.querySelector("#draw-result").innerHTML = "";
  document.querySelector("#roulette").textContent = "Preparando sorteo";
  showView("simulator");
}

function renderDashboard(dashboard, competencies) {
  const mastery = competencies.mastery || [];
  const output = document.querySelector("#dashboard-output");
  output.innerHTML = `
    <article class="result-card featured-card">
      <p class="eyebrow">Bienvenido a InfraSim</p>
      <h2>Panel del estudiante</h2>
      <p class="disclaimer">${dashboard.disclaimer}</p>
      <div class="stat-grid">
        ${statCard("Simulacros realizados", dashboard.attempts_count)}
        ${statCard("Promedio general", formatScore(dashboard.average_score))}
        ${statCard("Mejor resultado", formatScore(dashboard.best_score))}
        ${statCard("Último resultado", formatScore(dashboard.last_score))}
      </div>
      <h3>Desempeño general</h3>
      ${renderMeter(dashboard.average_score)}
      <p class="performance-label">${dashboard.performance_label}</p>
    </article>
    <article class="result-card">
      <h3>Indicador histórico</h3>
      <p>Últimos 5 simulacros</p>
      <p class="trend-line">${dashboard.recent_scores.length ? dashboard.recent_scores.map((score) => `${score} %`).join(" · ") : "Aún no hay simulacros registrados."}</p>
      <p>Tendencia: ${dashboard.trend}</p>
    </article>
    <article class="result-card">
      <h3>Competencias fuertes</h3>
      <p>${dashboard.strong_competencies.join(", ") || "Se consolidarán después de tus primeros simulacros."}</p>
      <h3>Competencias por reforzar</h3>
      <p>${dashboard.reinforce_competencies.join(", ") || "Todavía no hay competencias con prioridad alta."}</p>
    </article>
    ${renderGovernGroup(competencies.govern)}
    <article class="result-card">
      <h3>Indicador de aprendizaje</h3>
      <div class="result-list">
        ${mastery.map((item) => `
          <div class="result-item">
            <strong>${item.label}</strong>
            <p>${item.correct} / ${item.total} · ${item.percentage} %</p>
            ${renderMeter(item.percentage)}
            <p>${item.performance_label || item.priority}</p>
            <p>${item.message}</p>
          </div>
        `).join("")}
      </div>
    </article>
    ${renderRecommendations(dashboard.recommendations, "Conceptos para reforzar")}
    <div class="action-row">
      <button id="start-new-sim" type="button" class="primary-action">INICIAR NUEVO SIMULACRO</button>
      <button id="open-history" type="button" class="secondary-action">MIS SIMULACROS</button>
    </div>
  `;
  document.querySelector("#start-new-sim").addEventListener("click", startNewSimulation);
  document.querySelector("#open-history").addEventListener("click", () => openHistory());
}

function renderHistory(attempts) {
  const output = document.querySelector("#history-output");
  output.innerHTML = `
    <article class="result-card featured-card">
      <p class="eyebrow">Seguimiento</p>
      <h2>Mis simulacros</h2>
    </article>
    <article class="result-card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Caso</th>
              <th>Resultado</th>
              <th>Código</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${attempts.map((attempt) => `
              <tr>
                <td>${attempt.date}</td>
                <td>${attempt.case_name}</td>
                <td>${attempt.score === null || attempt.score === undefined ? "—" : `${attempt.score} %`}</td>
                <td class="sim-code">${attempt.seed || "—"}</td>
                <td>${attempt.status}</td>
                <td><button type="button" class="secondary-action" data-attempt-id="${attempt.id}">Ver detalle</button></td>
              </tr>
            `).join("") || `<tr><td colspan="6">Aún no has finalizado simulacros.</td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
    <div id="history-detail"></div>
  `;

  output.querySelectorAll("[data-attempt-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const attempt = await fetchAttemptDetail(button.getAttribute("data-attempt-id"));
        renderHistoryDetail(attempt);
      } catch (error) {
        await handleSessionError(error);
        const detail = document.querySelector("#history-detail");
        detail.innerHTML = `<div class="form-message">${friendlyMessage(error)}</div>`;
      }
    });
  });
}

function renderHistoryDetail(attempt) {
  const detail = document.querySelector("#history-detail");
  detail.innerHTML = `
    <article class="result-card">
      <h3>${attempt.case_name}</h3>
      <p>${attempt.date} · ${attempt.status} · ${formatScore(attempt.score)}</p>
      ${renderSimulacrumCode(attempt.seed)}
      <p class="disclaimer">${attempt.disclaimer || ""}</p>
    </article>
    ${renderCompetencyResults({}, attempt.competencies.map((item) => ({
      ...item,
      label: formatCompetency(item.competency),
    })))}
    ${renderTextList("Qué hiciste bien", attempt.feedback ? attempt.feedback.what_went_well : [])}
    ${renderTextList("Qué debes reforzar", attempt.feedback ? attempt.feedback.what_to_reinforce : [])}
    ${renderRecommendations(attempt.recommendations, "Te recomendamos reforzar")}
  `;
  detail.scrollIntoView({ behavior: "smooth" });
}

function renderSimulacrumCode(seed) {
  if (!seed) {
    return "";
  }
  return `
    <p class="sim-code-block">
      <span class="sim-code-label">Código del simulacro</span>
      <span class="sim-code">${seed}</span>
      <span class="sim-code-hint">Este código identifica el escenario de este intento.</span>
    </p>
  `;
}

function renderRecommendations(concepts, title) {
  const items = concepts || [];
  return `
    <article class="result-card">
      <h3>${title}</h3>
      <ol class="concept-list">
        ${items.slice(0, 3).map((concept) => `<li><strong>${concept.name}</strong></li>`).join("") || "<li>No hay conceptos prioritarios en este momento.</li>"}
      </ol>
    </article>
  `;
}

function renderConceptCards(concepts, title) {
  const items = concepts || [];
  return `
    <article class="result-card">
      <h3>${title}</h3>
      <div class="result-list">
        ${items.map((concept) => `
          <div class="result-item">
            <strong>${concept.name}</strong>
            <p>${concept.definition}</p>
            <p>${concept.why_it_matters}</p>
            <small>${concept.common_error}</small>
          </div>
        `).join("") || "<p>Consolida primero un simulacro para recibir conceptos relacionados.</p>"}
      </div>
    </article>
  `;
}

function renderTextList(title, values) {
  const items = values || [];
  return `
    <article class="result-card">
      <h3>${title}</h3>
      <ul class="constraint-list">
        ${items.map((value) => `<li>${value}</li>`).join("") || "<li>Sin registros para esta sección.</li>"}
      </ul>
    </article>
  `;
}

function renderMeter(score) {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const filled = Math.round(value / 10);
  const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
  return `<p class="meter">${bar} ${Number.isFinite(score) ? `${score} %` : "Sin registros"}</p>`;
}

function statCard(label, value) {
  return `
    <div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function formatScore(score) {
  return score === null || score === undefined ? "Sin registros" : `${score} %`;
}

function renderGovernGroup(govern) {
  const children = (govern && govern.children) || [];
  if (!children.length) {
    return "";
  }
  const prefixes = ["├─", "├─", "└─"];
  return `
    <article class="result-card">
      <h3>${govern.label || "GOBERNAR"}</h3>
      <div class="govern-tree">
        ${children.map((item, index) => `
          <p>${prefixes[index] || "└─"} ${item.label} ${item.percentage} %</p>
        `).join("")}
      </div>
    </article>
  `;
}

function friendlyMessage(error) {
  const raw = (error && error.message) || "";
  const lowered = raw.toLowerCase();
  if (
    !raw
    || lowered.includes("integrity")
    || lowered.includes("traceback")
    || lowered.includes("sqlalchemy")
    || lowered.includes("token")
    || lowered.includes("/api/")
    || lowered.includes("sqlite")
    || lowered.includes("students.email")
  ) {
    return "No fue posible completar la operación. Intenta nuevamente.";
  }
  return raw;
}

async function handleSessionError(error) {
  if (error && error.status === 401) {
    clearSessionToken();
    showView("login");
    const message = document.querySelector("#login-message");
    if (message) {
      message.textContent = "Tu sesion expiro. Ingresa nuevamente.";
    }
  }
}
