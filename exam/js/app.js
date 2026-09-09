const loginView = document.querySelector("#loginView");
const statusView = document.querySelector("#statusView");
const statusTitle = document.querySelector("#statusTitle");
const statusMessage = document.querySelector("#statusMessage");
const statusActions = document.querySelector("#statusActions");
const scenarioView = document.querySelector("#scenarioView");
const quizView = document.querySelector("#quizView");
const questionProgress = document.querySelector("#questionProgress");
const answeredProgress = document.querySelector("#answeredProgress");
const progressFill = document.querySelector("#progressFill");
const questionContainer = document.querySelector("#questionContainer");
const prevQuestion = document.querySelector("#prevQuestion");
const nextQuestion = document.querySelector("#nextQuestion");
const finishExam = document.querySelector("#finishExam");
let currentQuiz = null;
let currentQuestionIndex = 0;
let savedAnswers = {};

document.addEventListener("DOMContentLoaded", async () => {
  loginView.addEventListener("submit", handleLogin);
  prevQuestion.addEventListener("click", () => moveQuestion(-1));
  nextQuestion.addEventListener("click", () => moveQuestion(1));
  finishExam.addEventListener("click", handleFinish);
  try {
    const state = await fetchExamState();
    renderState(state);
  } catch (error) {
    showLogin();
  }
});

async function handleLogin(event) {
  event.preventDefault();
  const button = loginView.querySelector("button");
  button.disabled = true;
  try {
    const payload = await loginExam(
      document.querySelector("#email").value,
      document.querySelector("#accessCode").value
    );
    renderLoginResult(payload);
  } catch (error) {
    renderUnavailable(error.message || "No fue posible validar el acceso.");
  } finally {
    button.disabled = false;
  }
}

function renderLoginResult(payload) {
  if (payload.status === "authorized") {
    renderAuthorized(payload.exam_name);
    return;
  }
  if (payload.status === "resume") {
    renderInProgress(payload.scenario);
    return;
  }
  if (payload.status === "completed") {
    renderCompleted(payload);
    return;
  }
  renderUnavailable("El examen no se encuentra disponible.");
}

function renderState(payload) {
  if (payload.state === "not_started") {
    renderAuthorized(payload.exam_name);
    return;
  }
  if (payload.state === "in_progress") {
    renderInProgress(payload.scenario);
    if (payload.quiz) {
      currentQuiz = payload.quiz;
      savedAnswers = payload.answers || {};
      renderQuiz();
    }
    return;
  }
  if (payload.state === "completed") {
    renderCompleted(payload);
    return;
  }
  if (payload.state === "exam_closed_attempt_in_progress") {
    renderUnavailable("El examen está cerrado y tu intento sigue en progreso.");
    return;
  }
  showLogin();
}

function renderAuthorized(examName) {
  loginView.hidden = true;
  statusView.hidden = false;
  statusMessage.className = "";
  statusTitle.textContent = "Acceso autorizado";
  statusMessage.textContent = `Vas a presentar la evaluación de Gestión de Infraestructura TI. Dispones de un único intento. Al iniciar recibirás un único caso.`;
  statusActions.innerHTML = "";
  addButton("INICIAR EXAMEN", handleStart, "primary-action");
}

function renderInProgress(scenario = null) {
  loginView.hidden = true;
  statusView.hidden = false;
  statusMessage.className = "";
  statusTitle.textContent = "TIENES UNA EVALUACIÓN EN PROGRESO";
  statusMessage.textContent = "Puedes continuar con el mismo intento registrado.";
  statusActions.innerHTML = "";
  if (scenario) {
    renderScenario(scenario);
    addButton("INICIAR PREGUNTAS", loadQuiz, "primary-action");
  } else {
    addButton("CONTINUAR EXAMEN", handleStart, "primary-action");
  }
}

function renderCompleted(payload = {}) {
  loginView.hidden = true;
  statusView.hidden = false;
  scenarioView.hidden = true;
  quizView.hidden = true;
  statusMessage.className = "";
  statusTitle.textContent = "EVALUACIÓN ENVIADA CORRECTAMENTE";
  statusMessage.textContent = "Tu intento ha sido registrado. No podrás modificar tus respuestas.";
  statusActions.innerHTML = "";
  if (payload.release_results && payload.result) {
    renderReleasedResult(payload.result);
  }
}

function renderStarted() {
  loginView.hidden = true;
  statusView.hidden = false;
  statusTitle.textContent = "Tu intento ha sido iniciado correctamente.";
  statusMessage.textContent = "En la siguiente fase se cargará tu caso de evaluación.";
  statusActions.innerHTML = "";
}

function renderUnavailable(message) {
  statusView.hidden = false;
  statusTitle.textContent = "Examen no disponible";
  statusMessage.textContent = message;
  statusMessage.className = "error";
  statusActions.innerHTML = "";
}

async function handleStart() {
  try {
    const payload = await startExam();
    statusMessage.className = "";
    renderStarted();
    if (payload.scenario) {
      renderScenario(payload.scenario);
      addButton("INICIAR PREGUNTAS", loadQuiz, "primary-action");
    }
  } catch (error) {
    renderUnavailable(error.message || "No fue posible iniciar el examen.");
  }
}

function addButton(label, handler, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", handler);
  statusActions.appendChild(button);
  return button;
}

function showLogin() {
  loginView.hidden = false;
  statusView.hidden = true;
  scenarioView.hidden = true;
  quizView.hidden = true;
}

function renderScenario(scenario) {
  scenarioView.hidden = false;
  quizView.hidden = true;
  const organization = scenario.organization || {};
  scenarioView.innerHTML = `
    <article class="scenario-section">
      <h3>Contexto</h3>
      <p>${escapeHtml(scenario.context)}</p>
      <p><strong>Organización:</strong> ${escapeHtml(organization.name)}. Tamaño ${escapeHtml(organization.size)}, ${organization.employees} empleados, ${organization.locations} sedes.</p>
      <p>${escapeHtml(organization.operation)}</p>
    </article>
    ${listSection("Servicios", (scenario.services || []).map((item) => `${item.name} - criticidad ${item.criticality} - SLA ${item.sla_target_percent}%`))}
    ${listSection("Infraestructura", (scenario.infrastructure || []).map((item) => `${item.name} - ${item.type} - ${item.deployment} - ${item.redundant ? "con redundancia" : "sin redundancia visible"}`))}
    ${listSection("Dependencias", (scenario.dependencies || []).map((item) => `${item.source} -> ${item.target} (${item.type})`))}
    ${storageSection(scenario.storage)}
    ${objectSection("Backup", scenario.backup)}
    ${objectSection("Red", scenario.network)}
    ${objectSection("Seguridad", scenario.security)}
    ${objectSection("Operación", scenario.operations)}
    ${objectSection("Evidencia", scenario.evidence_profile)}
    ${metricsSection(scenario.metrics)}
    ${listSection("Incidentes", (scenario.incidents || []).map((item) => `${item.title}: ${item.impact} Duración: ${item.duration_hours ?? "sin evidencia"} h`))}
    ${listSection("Restricciones", scenario.constraints || [])}
  `;
}

function renderQuestionsPending() {
  scenarioView.hidden = true;
  quizView.hidden = true;
  statusTitle.textContent = "Preguntas pendientes";
  statusMessage.textContent = "Las preguntas de evaluación se habilitarán en la siguiente fase.";
  statusActions.innerHTML = "";
}

async function loadQuiz() {
  try {
    currentQuiz = await fetchExamQuiz();
    currentQuestionIndex = 0;
    renderQuiz();
  } catch (error) {
    renderUnavailable(error.message || "No fue posible cargar las preguntas.");
  }
}

function renderQuiz() {
  if (!currentQuiz || !currentQuiz.questions.length) return;
  quizView.hidden = false;
  const question = currentQuiz.questions[currentQuestionIndex];
  questionProgress.textContent = `Pregunta ${question.number} de ${currentQuiz.questions.length}`;
  answeredProgress.textContent = `Respondidas: ${Object.keys(savedAnswers).length} / ${currentQuiz.questions.length}`;
  progressFill.style.width = `${((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100}%`;
  prevQuestion.disabled = currentQuestionIndex === 0;
  nextQuestion.disabled = currentQuestionIndex === currentQuiz.questions.length - 1;
  finishExam.disabled = false;
  questionContainer.innerHTML = `
    <p class="eyebrow">${escapeHtml(question.competency)}</p>
    <h2>${escapeHtml(questionProgress.textContent)}</h2>
    <p>${escapeHtml(question.prompt)}</p>
    ${renderAnswerControl(question)}
  `;
  bindAnswerControl(question);
}

function renderAnswerControl(question) {
  const saved = savedAnswers[question.id] ?? "";
  if (question.type === "numeric_input") {
    return `<input id="answer-${question.id}" type="text" inputmode="decimal" value="${escapeHtml(saved)}">`;
  }
  if (question.type === "short_input") {
    return `<textarea id="answer-${question.id}">${escapeHtml(saved)}</textarea>`;
  }
  return `<div class="answer-options">${question.options.map((option) => `
    <label><input type="radio" name="${question.id}" value="${escapeHtml(option.id)}" ${saved === option.id ? "checked" : ""}> ${escapeHtml(option.text)}</label>
  `).join("")}</div>`;
}

function bindAnswerControl(question) {
  const selector = question.type === "multiple_choice" ? `[name="${question.id}"]` : `#answer-${question.id}`;
  document.querySelectorAll(selector).forEach((control) => {
    control.addEventListener("change", () => persistAnswer(question, control.value));
    control.addEventListener("input", () => persistAnswer(question, control.value));
  });
}

async function persistAnswer(question, value) {
  savedAnswers[question.id] = value;
  answeredProgress.textContent = `Respondidas: ${Object.keys(savedAnswers).length} / ${currentQuiz.questions.length}`;
  try {
    const payload = await saveExamAnswer(question.id, value);
    savedAnswers = payload.answers || savedAnswers;
  } catch (error) {
    statusMessage.textContent = error.message || "No fue posible guardar la respuesta.";
  }
}

async function handleFinish() {
  if (!currentQuiz) return;
  const confirmed = window.confirm(
    "¿Deseas finalizar y enviar tu evaluación?\n\nDespués de enviarla no podrás modificar tus respuestas."
  );
  if (!confirmed) return;

  finishExam.disabled = true;
  try {
    const payload = await finishExamAttempt();
    if (payload.status === "incomplete") {
      renderIncompleteFinish(payload);
      finishExam.disabled = false;
      return;
    }
    renderCompleted(payload);
  } catch (error) {
    statusMessage.className = "error";
    statusMessage.textContent = error.message || "No fue posible finalizar el examen.";
    finishExam.disabled = false;
  }
}

function renderIncompleteFinish(payload) {
  statusView.hidden = false;
  statusTitle.textContent = "Tu evaluación aún no está completa.";
  statusMessage.className = "error";
  statusMessage.textContent = `Te faltan ${payload.missing.length} preguntas por responder. Respondidas: ${payload.answered} de ${payload.total}.`;
  statusActions.innerHTML = "";
  const firstMissing = payload.missing[0];
  if (firstMissing && currentQuiz) {
    addButton("IR A PREGUNTA PENDIENTE", () => {
      currentQuestionIndex = currentQuiz.questions.findIndex((question) => question.id === firstMissing);
      renderQuiz();
      questionContainer.scrollIntoView({behavior: "smooth", block: "start"});
    }, "secondary-action");
  }
}

function renderReleasedResult(result) {
  const summary = document.createElement("div");
  summary.className = "result-summary";
  const correctAnswers = result["correct" + "_answers"];
  summary.innerHTML = `
    <p><strong>Puntaje:</strong> ${escapeHtml(result.score)}%</p>
    <p><strong>Correctas:</strong> ${escapeHtml(correctAnswers)} de ${escapeHtml(result.total_questions)}</p>
    <div class="competency-grid">
      ${(result.competencies || []).map((item) => `
        <div>
          <strong>${escapeHtml(item.competency.toUpperCase())}</strong>
          <span>${escapeHtml(item.correct)} / ${escapeHtml(item.total)} - ${escapeHtml(item.percentage)}%</span>
        </div>
      `).join("")}
    </div>
  `;
  statusActions.appendChild(summary);
}

function moveQuestion(offset) {
  if (!currentQuiz) return;
  currentQuestionIndex = Math.min(Math.max(currentQuestionIndex + offset, 0), currentQuiz.questions.length - 1);
  renderQuiz();
}

function listSection(title, items) {
  return `<article class="scenario-section"><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`;
}

function objectSection(title, value) {
  const entries = Object.entries(value || {}).map(([key, entry]) => `${formatKey(key)}: ${entry ?? "sin evidencia"}`);
  return listSection(title, entries);
}

function storageSection(value = {}) {
  return objectSection("Almacenamiento", value);
}

function metricsSection(metrics = {}) {
  const entries = Object.entries(metrics).map(([key, value]) => `<div><strong>${escapeHtml(formatKey(key))}</strong><br>${escapeHtml(value ?? "sin evidencia")}</div>`);
  return `<article class="scenario-section"><h3>Métricas</h3><div class="metric-grid">${entries.join("")}</div></article>`;
}

function formatKey(key) {
  return String(key).replaceAll("_", " ");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[character]));
}
