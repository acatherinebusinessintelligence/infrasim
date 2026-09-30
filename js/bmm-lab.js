const BMM_STORAGE_KEY = "infrasim_bmm_lab";
const BMM_AI_TRACE_KEY = "infrasim_bmm_ai_interactions";
const AI_MAX_INTERACTIONS_PER_SESSION = 20;
const BMM_TOTAL_STAGES = 6;
const BMM_SYNTHESIS_STAGE = 7;

const BUSINESS_MICRO_QUESTIONS = [
  {
    field: "business_goal",
    text: "Que resultado necesita mantener NovaPay?",
    hint: "Pista estructural: resultado de negocio.",
  },
  {
    field: "affected_users",
    text: "Quien depende de ese resultado?",
    hint: "Pista estructural: actor o usuario afectado.",
  },
  {
    field: "business_impact",
    text: "Que ocurre si ese resultado deja de cumplirse?",
    hint: "Pista estructural: consecuencia para operacion, confianza o ingresos.",
  },
  {
    field: "critical_service",
    text: "Que servicio o capacidad parece critica para sostenerlo?",
    hint: "Pista estructural: capacidad que permite mantener el resultado.",
  },
];

const EMPTY_STATE = {
  business_goal: "",
  affected_users: "",
  critical_service: "",
  influencers: [],
  current_capabilities: [],
  capability_gaps: [],
  current_capabilities_text: "",
  priority_risk: "",
  business_impact: "",
  technology_dependency: "",
  student_conclusion: "",
  business_protection: "",
  risk_reason: "",
  first_ideas: {},
  stage_progress: {
    business: {
      stage: "Negocio",
      question_number: 1,
      active_question: 0,
      synthesis: "",
      history: [],
    },
  },
  session_started_at: "",
  session_updated_at: "",
};

const STAGE_TITLES = {
  1: "Negocio",
  2: "Objetivos",
  3: "Capacidades",
  4: "Riesgos",
  5: "Infraestructura",
  6: "Impacto",
  7: "Sintesis",
};

const EVIDENCE_LABELS = {
  SUPPORTED: "Sustentado en el caso",
  PARTIALLY_SUPPORTED: "Parcialmente sustentado",
  NOT_FOUND: "No encontrado en el caso",
  NOT_APPLICABLE: "No aplica como evidencia",
};

let bmmState = loadBmmState();
let activeStage = 1;

document.addEventListener("DOMContentLoaded", () => {
  bindBmmNavigation();
  bindBmmPersistence();
  bindAiMentor();
  hydrateBmmForm();
  showBmmStage(activeStage, { scroll: false });
  renderBmmSummary();
  renderTeacherReview();
  configureTeacherReviewVisibility();
  renderBusinessMicroQuestion();
  updateMentorButtons();
});

function bindBmmNavigation() {
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => showBmmStage(Number(button.dataset.stage)));
  });

  const previousButton = document.querySelector("#bmm-prev");
  const nextButton = document.querySelector("#bmm-next");

  if (previousButton) {
    previousButton.addEventListener("click", () => {
      if (activeStage === 1 && moveBusinessMicroQuestion(-1)) {
        return;
      }
      showBmmStage(Math.max(1, activeStage - 1));
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      if (activeStage === 1 && continueBusinessMicroQuestion()) {
        return;
      }
      persistBmmForm();
      renderSavedMessage();
      if (activeStage < BMM_SYNTHESIS_STAGE) {
        window.setTimeout(() => showBmmStage(activeStage + 1), 240);
      }
    });
  }

  const toggleReasoning = document.querySelector("#toggle-bmm-reasoning");
  if (toggleReasoning) {
    toggleReasoning.addEventListener("click", () => {
      const reasoning = document.querySelector("#bmm-full-reasoning");
      reasoning.hidden = !reasoning.hidden;
      toggleReasoning.textContent = reasoning.hidden ? "Ver razonamiento completo" : "Ocultar razonamiento completo";
      renderTeacherReview();
    });
  }
}

function bindAiMentor() {
  document.querySelectorAll("[data-ai-coach]").forEach((button) => {
    button.addEventListener("click", async () => {
      const stage = button.dataset.aiCoach;
      const panel = document.querySelector(`[data-ai-panel="${stage}"]`);
      const interactions = loadAiInteractions();

      if (interactions.length >= AI_MAX_INTERACTIONS_PER_SESSION) {
        renderAiLimit(panel);
        return;
      }

      persistBmmForm();
      const answer = answerForStage(stage);
      if (!answer.trim()) {
        renderAiMessage(panel, "Para consultar el mentor, escribe primero una respuesta en esta etapa.");
        updateMentorShell(stage, true);
        return;
      }

      captureFirstIdea(stage, answer);
      updateMentorShell(stage, true);
      panel.hidden = false;
      panel.innerHTML = `<p class="ai-loading">Consultando Mentor IA...</p>`;
      button.disabled = true;

      try {
        const payload = {
          case_id: "C03",
          stage,
          student_answer: answer,
          previous_answers: compactPreviousAnswers(),
          student_question: null,
        };
        const response = await askBmmMentor(payload);
        renderAiFeedback(panel, stage, response.mentor || {}, response.ai_rate_limit || {});
        saveAiInteraction({
          case_id: "C03",
          stage,
          student_answer_before: bmmState.first_ideas[stage] || answer,
          retrieved_chunk_ids: response.retrieved_chunk_ids || [],
          ai_feedback: response.mentor || {},
          student_answer_after: answerForStage(stage),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        if (error && error.status === 429) {
          renderAiLimit(panel);
        } else {
          renderAiMessage(panel, "No pudimos conectar con el Mentor IA. Conserva tu avance y continua el recorrido.");
        }
      } finally {
        button.disabled = false;
        updateMentorButtons();
      }
    });
  });
}

function bindBmmPersistence() {
  const form = document.querySelector("#bmm-form");
  if (!form) {
    return;
  }
  form.addEventListener("input", () => {
    persistBmmForm();
    renderBmmSummary();
    renderTeacherReview();
    updateMentorButtons();
    updateVisibleIterations();
  });
  form.addEventListener("change", () => {
    persistBmmForm();
    renderBmmSummary();
    renderTeacherReview();
    updateMentorButtons();
    updateVisibleIterations();
  });
}

function showBmmStage(stage, options = {}) {
  const nextStage = Math.max(1, Math.min(BMM_SYNTHESIS_STAGE, Number(stage) || 1));
  activeStage = nextStage;

  document.querySelectorAll("[data-stage]").forEach((button) => {
    const buttonStage = Number(button.dataset.stage);
    button.classList.toggle("active", buttonStage === activeStage);
    button.classList.toggle("completed", buttonStage < activeStage);
  });

  document.querySelectorAll("[data-stage-panel]").forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.stagePanel) === activeStage);
  });

  updateProgress();
  updateWizardButtons();
  persistBmmForm();
  renderBmmSummary();
  renderTeacherReview();
  renderBusinessMicroQuestion();
  updateMentorButtons();

  if (options.scroll !== false) {
    document.querySelector(".bmm-lab-hero").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function updateProgress() {
  const progressLabel = document.querySelector("#bmm-stage-label");
  const progressFill = document.querySelector("#bmm-progress-fill");
  const progressStage = Math.min(activeStage, BMM_TOTAL_STAGES);
  const percent = activeStage === BMM_SYNTHESIS_STAGE ? 100 : Math.round((progressStage / BMM_TOTAL_STAGES) * 100);

  if (progressLabel) {
    progressLabel.textContent = activeStage === BMM_SYNTHESIS_STAGE
      ? "Sintesis final"
      : `Etapa ${progressStage} de ${BMM_TOTAL_STAGES}`;
  }
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
}

function updateWizardButtons() {
  const previousButton = document.querySelector("#bmm-prev");
  const nextButton = document.querySelector("#bmm-next");
  if (previousButton) {
    previousButton.disabled = activeStage === 1;
  }
  if (nextButton) {
    if (activeStage === 1) {
      const progress = getBusinessProgress();
      nextButton.textContent = progress.active_question >= BUSINESS_MICRO_QUESTIONS.length
        ? "Guardar sintesis y continuar"
        : "Continuar";
    } else {
      nextButton.textContent = activeStage === BMM_SYNTHESIS_STAGE ? "Guardar sintesis" : "Guardar y continuar";
    }
  }
}

function hydrateBmmForm() {
  Object.entries(bmmState).forEach(([name, value]) => {
    if (name === "influencers") {
      document.querySelectorAll(`[name="${name}"]`).forEach((input) => {
        input.checked = Array.isArray(value) && value.includes(input.value);
      });
      return;
    }

    if (name === "first_ideas" || name === "stage_progress") {
      return;
    }

    const input = document.querySelector(`[name="${name}"]`);
    if (input) {
      input.value = value || "";
    }
  });
}

function persistBmmForm() {
  const form = document.querySelector("#bmm-form");
  if (!form) {
    return;
  }

  const data = new FormData(form);
  const now = new Date().toISOString();
  const businessSynthesis = formValue(data, "business_protection", bmmState.business_protection);
  const stageProgress = normalizeStageProgress(bmmState.stage_progress);
  stageProgress.business.synthesis = businessSynthesis;
  stageProgress.business.question_number = Math.min(
    BUSINESS_MICRO_QUESTIONS.length,
    stageProgress.business.active_question + 1,
  );
  bmmState = {
    ...EMPTY_STATE,
    ...bmmState,
    business_goal: formValue(data, "business_goal", bmmState.business_goal),
    affected_users: formValue(data, "affected_users", bmmState.affected_users),
    critical_service: formValue(data, "critical_service", bmmState.critical_service),
    influencers: data.getAll("influencers"),
    current_capabilities: [],
    capability_gaps: [],
    current_capabilities_text: formValue(data, "current_capabilities_text", bmmState.current_capabilities_text),
    priority_risk: formValue(data, "priority_risk", bmmState.priority_risk),
    business_impact: formValue(data, "business_impact", bmmState.business_impact),
    technology_dependency: formValue(data, "technology_dependency", bmmState.technology_dependency),
    student_conclusion: formValue(data, "student_conclusion", bmmState.student_conclusion),
    business_protection: formValue(data, "business_protection", bmmState.business_protection),
    risk_reason: formValue(data, "risk_reason", bmmState.risk_reason),
    first_ideas: bmmState.first_ideas || {},
    stage_progress: stageProgress,
    session_started_at: bmmState.session_started_at || now,
    session_updated_at: now,
  };
  localStorage.setItem(BMM_STORAGE_KEY, JSON.stringify(bmmState));
}

function formValue(data, name, fallback = "") {
  const value = data.get(name);
  if (value === null || String(value).trim() === "") {
    return fallback || "";
  }
  return value;
}

function loadBmmState() {
  try {
    const saved = JSON.parse(localStorage.getItem(BMM_STORAGE_KEY) || "{}");
    return {
      ...EMPTY_STATE,
      ...saved,
      first_ideas: saved.first_ideas || {},
      stage_progress: normalizeStageProgress(saved.stage_progress),
    };
  } catch (error) {
    return { ...EMPTY_STATE };
  }
}

function normalizeStageProgress(progress) {
  const savedBusiness = progress && progress.business ? progress.business : {};
  return {
    business: {
      stage: "Negocio",
      question_number: Number(savedBusiness.question_number) || 1,
      active_question: Math.max(0, Math.min(
        BUSINESS_MICRO_QUESTIONS.length,
        Number(savedBusiness.active_question) || 0,
      )),
      synthesis: savedBusiness.synthesis || "",
      history: Array.isArray(savedBusiness.history) ? savedBusiness.history : [],
    },
  };
}

function getBusinessProgress() {
  bmmState.stage_progress = normalizeStageProgress(bmmState.stage_progress);
  return bmmState.stage_progress.business;
}

function renderBusinessMicroQuestion() {
  const shell = document.querySelector('[data-micro-stage="business"]');
  const synthesisPanel = document.querySelector("#business-stage-synthesis");
  if (!shell || !synthesisPanel) {
    return;
  }

  const progress = getBusinessProgress();
  const isSynthesis = progress.active_question >= BUSINESS_MICRO_QUESTIONS.length;
  const currentQuestion = BUSINESS_MICRO_QUESTIONS[Math.min(progress.active_question, BUSINESS_MICRO_QUESTIONS.length - 1)];
  const currentAnswer = bmmState[currentQuestion.field] || "";
  const previousQuestion = BUSINESS_MICRO_QUESTIONS[progress.active_question - 1];
  const previousIdea = document.querySelector("#business-previous-idea");
  const questionText = document.querySelector("#business-question-text");
  const answerInput = document.querySelector("#business-micro-answer");
  const progressLabel = document.querySelector("#business-question-progress");
  const hint = document.querySelector("#business-question-hint");

  shell.hidden = isSynthesis;
  synthesisPanel.hidden = !isSynthesis;

  if (!isSynthesis) {
    progressLabel.textContent = `Pregunta ${progress.active_question + 1} de ${BUSINESS_MICRO_QUESTIONS.length}`;
    questionText.textContent = currentQuestion.text;
    answerInput.value = currentAnswer;
    answerInput.dataset.field = currentQuestion.field;
    hint.textContent = currentQuestion.hint;
    if (previousQuestion && bmmState[previousQuestion.field]) {
      previousIdea.hidden = false;
      previousIdea.innerHTML = `<strong>Tu idea anterior:</strong> ${escapeHtml(bmmState[previousQuestion.field])}`;
    } else {
      previousIdea.hidden = true;
      previousIdea.textContent = "";
    }
  }

  renderBusinessStageHistory();
  updateWizardButtons();
}

function continueBusinessMicroQuestion() {
  const progress = getBusinessProgress();
  const now = new Date().toISOString();

  if (progress.active_question < BUSINESS_MICRO_QUESTIONS.length) {
    const input = document.querySelector("#business-micro-answer");
    const question = BUSINESS_MICRO_QUESTIONS[progress.active_question];
    const answer = input ? input.value.trim() : "";
    bmmState[question.field] = answer;
    progress.history = upsertBusinessHistory(progress.history, {
      stage: "Negocio",
      question_number: progress.active_question + 1,
      question_id: question.field,
      question: question.text,
      answer,
      timestamp: now,
      synthesis: progress.synthesis || bmmState.business_protection || "",
    });
    progress.active_question += 1;
    progress.question_number = Math.min(BUSINESS_MICRO_QUESTIONS.length, progress.active_question + 1);
    bmmState.stage_progress.business = progress;
    persistBmmForm();
    renderSavedMessage();
    renderBusinessMicroQuestion();
    renderBmmSummary();
    renderTeacherReview();
    updateMentorButtons();
    return true;
  }

  persistBmmForm();
  progress.synthesis = bmmState.business_protection;
  progress.history = upsertBusinessHistory(progress.history, {
    stage: "Negocio",
    question_number: BUSINESS_MICRO_QUESTIONS.length + 1,
    question_id: "business_protection",
    question: "Sintesis de etapa",
    answer: bmmState.business_protection,
    timestamp: now,
    synthesis: bmmState.business_protection,
  });
  bmmState.stage_progress.business = progress;
  localStorage.setItem(BMM_STORAGE_KEY, JSON.stringify(bmmState));
  renderSavedMessage();
  window.setTimeout(() => showBmmStage(2), 240);
  return true;
}

function moveBusinessMicroQuestion(direction) {
  const progress = getBusinessProgress();
  if (direction < 0 && progress.active_question > 0) {
    progress.active_question -= 1;
    progress.question_number = Math.max(1, progress.active_question + 1);
    bmmState.stage_progress.business = progress;
    localStorage.setItem(BMM_STORAGE_KEY, JSON.stringify(bmmState));
    renderBusinessMicroQuestion();
    updateMentorButtons();
    return true;
  }
  return false;
}

function upsertBusinessHistory(history, entry) {
  const filtered = history.filter((item) => item.question_id !== entry.question_id);
  filtered.push(entry);
  return filtered.sort((a, b) => a.question_number - b.question_number);
}

function renderBusinessStageHistory() {
  const container = document.querySelector("#business-stage-history");
  if (!container) {
    return;
  }
  const progress = getBusinessProgress();
  const rows = progress.history.filter((item) => item.question_id !== "business_protection");
  container.innerHTML = `
    <h4>Historial de la etapa</h4>
    ${rows.map((item) => `
      <div>
        <strong>Pregunta ${escapeHtml(item.question_number)}:</strong>
        <span>${escapeHtml(item.answer || "Pendiente")}</span>
      </div>
    `).join("")}
  `;
}

function renderBmmSummary() {
  const rows = synthesisRows();

  const finalCard = document.querySelector("#bmm-final-card");
  if (finalCard) {
    finalCard.innerHTML = rows.map(([label, value]) => renderSynthesisItem(label, value)).join("");
  }
}

function renderTeacherReview() {
  const reviewSummary = document.querySelector("#bmm-review-summary");
  const fullReasoning = document.querySelector("#bmm-full-reasoning");
  if (!reviewSummary || !fullReasoning) {
    return;
  }

  const reviewRows = [
    ["Objetivo / resultado identificado", bmmState.business_goal],
    ["Usuarios / actores afectados", bmmState.affected_users],
    ["Influenciadores seleccionados", bmmState.influencers.join(", ")],
    ["Explicacion del factor prioritario", bmmState.risk_reason],
    ["Conclusion final del estudiante", bmmState.student_conclusion],
    ["Fecha/hora de la sesion", formatSessionDate(bmmState.session_updated_at || bmmState.session_started_at)],
  ];

  reviewSummary.innerHTML = reviewRows.map(([label, value]) => renderBmmMapItem(label, value)).join("");

  const reasoningRows = [
    ["1. Actores y expectativas", bmmState.affected_users],
    ["2. Objetivo o resultado de negocio", bmmState.business_goal],
    ["3. Capacidad o servicio critico", bmmState.critical_service],
    ["4. Influenciadores seleccionados", bmmState.influencers.join(", ")],
    ["5. Factor prioritario", bmmState.priority_risk],
    ["6. Explicacion del factor prioritario", bmmState.risk_reason],
    ["7. Dependencia tecnologica identificada", bmmState.technology_dependency],
    ["8. Impacto si falla", bmmState.business_impact],
    ["9. Conclusion final", bmmState.student_conclusion],
  ];

  fullReasoning.innerHTML = `
    <h3>Recorrido de respuestas</h3>
    <ol>
      ${reasoningRows.map(([label, value]) => `
        <li>
          <strong>${escapeHtml(label)}</strong>
          <p>${escapeHtml(value || "Pendiente por completar")}</p>
        </li>
      `).join("")}
    </ol>
  `;
}

function configureTeacherReviewVisibility() {
  const review = document.querySelector("#revision-docente");
  if (!review) {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  review.hidden = params.get("teacher") !== "1";
}

function synthesisRows() {
  return [
    ["Negocio", bmmState.affected_users],
    ["Objetivo", bmmState.business_goal],
    ["Capacidad", bmmState.critical_service],
    ["Riesgo", [bmmState.priority_risk, bmmState.risk_reason].filter(Boolean).join(": ")],
    ["Dependencia tecnologica", bmmState.technology_dependency],
    ["Impacto", bmmState.business_impact],
  ];
}

function answerForStage(stage) {
  const answers = {
    affected_users: bmmState.affected_users,
    business_goal: [bmmState.business_goal, bmmState.business_protection].filter(Boolean).join("\n"),
    objectives: [bmmState.business_goal, bmmState.business_protection].filter(Boolean).join("\n"),
    critical_service: [bmmState.critical_service, bmmState.current_capabilities_text].filter(Boolean).join("\n"),
    influencers: [
      `Influenciadores: ${bmmState.influencers.join(", ")}`,
      `Factor prioritario: ${bmmState.priority_risk}`,
      bmmState.risk_reason,
    ].filter(Boolean).join("\n"),
    technology_dependency: bmmState.technology_dependency,
    business_impact: bmmState.business_impact,
    student_conclusion: bmmState.student_conclusion,
  };
  return answers[stage] || "";
}

function compactPreviousAnswers() {
  return [
    { stage: "affected_users", answer: bmmState.affected_users },
    { stage: "business_goal", answer: bmmState.business_goal },
    { stage: "critical_service", answer: bmmState.critical_service },
    { stage: "priority_risk", answer: bmmState.priority_risk },
    { stage: "technology_dependency", answer: bmmState.technology_dependency },
    { stage: "business_impact", answer: bmmState.business_impact },
  ].filter((item) => item.answer);
}

function captureFirstIdea(stage, answer) {
  if (!bmmState.first_ideas) {
    bmmState.first_ideas = {};
  }
  if (!bmmState.first_ideas[stage]) {
    bmmState.first_ideas[stage] = answer;
    localStorage.setItem(BMM_STORAGE_KEY, JSON.stringify(bmmState));
  }
}

function updateMentorButtons() {
  document.querySelectorAll("[data-ai-coach]").forEach((button) => {
    const stage = button.dataset.aiCoach;
    const answer = answerForStage(stage);
    if (stage === "business_goal") {
      const progress = getBusinessProgress();
      button.disabled = progress.active_question < BUSINESS_MICRO_QUESTIONS.length
        || bmmState.business_protection.trim().length < 8;
      return;
    }
    button.disabled = answer.trim().length < 8;
  });
}

function updateMentorShell(stage, hasFeedback) {
  const shell = document.querySelector(`[data-mentor-shell="${stage}"]`);
  if (shell) {
    shell.classList.toggle("has-feedback", Boolean(hasFeedback));
  }
}

function renderAiFeedback(panel, stage, mentor, rateLimit) {
  const reasoning = mentor.reasoning || {};
  const remaining = rateLimit && rateLimit.remaining !== null ? rateLimit.remaining : null;
  const limit = rateLimit && rateLimit.limit !== null ? rateLimit.limit : null;
  const evidenceStatus = EVIDENCE_LABELS[mentor.evidence_status] || "Evidencia por revisar";

  panel.hidden = false;
  panel.innerHTML = `
    <article class="mentor-feedback-card">
      <p class="eyebrow">Mentor IA</p>
      ${remaining !== null ? `<p class="ai-rate-limit">Consultas disponibles en esta sesion: ${escapeHtml(remaining)}${limit !== null ? ` / ${escapeHtml(limit)}` : ""}</p>` : ""}
      <div class="mentor-feedback-grid">
        ${renderAiFeedbackBlock("Vas bien en", mentor.strength)}
        ${renderAiFeedbackBlock("Revisa esto", mentor.gap)}
        <div class="mentor-question">
          <strong>Ahora piensa</strong>
          <p>${escapeHtml(mentor.socratic_question || "Que conexion puedes hacer mas explicita con el caso?")}</p>
        </div>
      </div>
      <div class="evidence-chip">
        <strong>${escapeHtml(evidenceStatus)}</strong>
        <span>${escapeHtml(mentor.evidence_note || "Sin nota de evidencia disponible.")}</span>
      </div>
      <p class="reasoning-caption">Nivel de desarrollo del razonamiento</p>
      <div class="reasoning-meter-grid">
        ${renderReasoningMeter("Negocio", reasoning.business)}
        ${renderReasoningMeter("Evidencia", reasoning.evidence)}
        ${renderReasoningMeter("Relacion causal", reasoning.causal_link)}
        ${renderReasoningMeter("Especificidad", reasoning.specificity)}
        ${renderReasoningMeter("Profundidad", reasoning.depth)}
      </div>
      ${renderIterationBlock(stage)}
    </article>
  `;
}

function renderAiFeedbackBlock(title, value) {
  return `
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(value || "Sin observacion disponible.")}</p>
    </div>
  `;
}

function renderReasoningMeter(label, value) {
  const safeValue = Math.max(0, Math.min(4, Number.parseInt(value, 10) || 0));
  const segments = Array.from({ length: 4 }, (_, index) => (
    `<span class="reasoning-dot${index < safeValue ? " active" : ""}"></span>`
  )).join("");
  return `
    <div class="reasoning-meter" title="Este indicador muestra que tan desarrollado esta tu razonamiento en esta dimension. No es una nota.">
      <span>${escapeHtml(label)}</span>
      <strong class="reasoning-dots" aria-label="Indicador de madurez del razonamiento">${segments}</strong>
    </div>
  `;
}

function renderIterationBlock(stage) {
  const firstIdea = (bmmState.first_ideas && bmmState.first_ideas[stage]) || answerForStage(stage);
  const revisedIdea = answerForStage(stage);
  return `
    <div class="iteration-card">
      <h4>Quieres fortalecer tu respuesta?</h4>
      <div>
        <strong>Tu primera idea</strong>
        <p>${escapeHtml(firstIdea || "Pendiente por consultar el mentor.")}</p>
      </div>
      <div>
        <strong>Tu version revisada</strong>
        <p>${escapeHtml(revisedIdea || "Edita tu respuesta para ver como evoluciona.")}</p>
      </div>
    </div>
  `;
}

function updateVisibleIterations() {
  document.querySelectorAll("[data-ai-panel]").forEach((panel) => {
    if (!panel.hidden) {
      const stage = panel.dataset.aiPanel;
      const iteration = panel.querySelector(".iteration-card");
      if (iteration) {
        iteration.outerHTML = renderIterationBlock(stage);
      }
    }
  });
}

function renderAiMessage(panel, message) {
  if (!panel) {
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `<div class="ai-mentor-panel-message">${escapeHtml(message)}</div>`;
}

function renderAiLimit(panel) {
  renderAiMessage(panel, "Has alcanzado el limite de consultas del mentor para esta sesion.");
}

function renderSavedMessage() {
  const message = document.querySelector("#bmm-save-message");
  if (!message) {
    return;
  }
  message.textContent = "Reflexion guardada";
  message.classList.add("success");
  window.setTimeout(() => {
    message.textContent = "";
  }, 1600);
}

function loadAiInteractions() {
  try {
    const interactions = JSON.parse(localStorage.getItem(BMM_AI_TRACE_KEY) || "[]");
    return Array.isArray(interactions) ? interactions : [];
  } catch (error) {
    return [];
  }
}

function saveAiInteraction(interaction) {
  const interactions = loadAiInteractions();
  interactions.push(interaction);
  localStorage.setItem(BMM_AI_TRACE_KEY, JSON.stringify(interactions.slice(-AI_MAX_INTERACTIONS_PER_SESSION)));
}

function formatSessionDate(value) {
  if (!value) {
    return "Pendiente por guardar";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderBmmMapItem(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "Pendiente por completar")}</dd>
    </div>
  `;
}

function renderSynthesisItem(label, value) {
  return `
    <div class="synthesis-node">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || "Pendiente por completar")}</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
