const BMM_STORAGE_KEY = "infrasim_bmm_lab";
const BMM_AI_TRACE_KEY = "infrasim_bmm_ai_interactions";
const AI_MAX_INTERACTIONS_PER_SESSION = 20;

const EMPTY_STATE = {
  business_goal: "",
  affected_users: "",
  critical_service: "",
  influencers: [],
  current_capabilities: [],
  capability_gaps: [],
  priority_risk: "",
  business_impact: "",
  technology_dependency: "",
  student_conclusion: "",
  business_protection: "",
  risk_reason: "",
  session_started_at: "",
  session_updated_at: "",
};

let bmmState = loadBmmState();

document.addEventListener("DOMContentLoaded", () => {
  bindBmmNavigation();
  bindBmmPersistence();
  bindAiMentor();
  hydrateBmmForm();
  renderBmmSummary();
  renderTeacherReview();
});

function bindBmmNavigation() {
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.addEventListener("click", () => showBmmStage(button.dataset.stage));
  });

  document.querySelectorAll("[data-next-stage]").forEach((button) => {
    button.addEventListener("click", () => showBmmStage(button.dataset.nextStage));
  });

  const reveal = document.querySelector("[data-reveal-influencers]");
  if (reveal) {
    reveal.addEventListener("click", () => {
      document.querySelector("#influencer-reveal").hidden = false;
      persistBmmForm();
    });
  }

  document.querySelector("#save-bmm").addEventListener("click", () => {
    persistBmmForm();
    document.querySelector("#bmm-final-reveal").hidden = false;
    renderBmmSummary();
    renderTeacherReview();
    const message = document.querySelector("#bmm-save-message");
    message.textContent = "Conclusion guardada en este navegador.";
    message.classList.add("success");
  });

  document.querySelector("#toggle-bmm-reasoning").addEventListener("click", () => {
    const reasoning = document.querySelector("#bmm-full-reasoning");
    const button = document.querySelector("#toggle-bmm-reasoning");
    reasoning.hidden = !reasoning.hidden;
    button.textContent = reasoning.hidden ? "Ver razonamiento completo" : "Ocultar razonamiento completo";
    renderTeacherReview();
  });
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
        return;
      }

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
        renderAiFeedback(panel, response.mentor, response.ai_rate_limit);
        saveAiInteraction({
          case_id: "C03",
          stage,
          student_answer_before: answer,
          retrieved_chunk_ids: response.retrieved_chunk_ids || [],
          ai_feedback: response.mentor,
          student_answer_after: answerForStage(stage),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        renderAiMessage(panel, "El Mentor IA no esta disponible en este momento. Puedes continuar con la actividad normalmente.");
      } finally {
        button.disabled = false;
      }
    });
  });
}

function bindBmmPersistence() {
  const form = document.querySelector("#bmm-form");
  form.addEventListener("input", () => {
    persistBmmForm();
    renderBmmSummary();
    renderTeacherReview();
  });
  form.addEventListener("change", () => {
    persistBmmForm();
    renderBmmSummary();
    renderTeacherReview();
  });
}

function showBmmStage(stage) {
  document.querySelectorAll("[data-stage]").forEach((button) => {
    button.classList.toggle("active", button.dataset.stage === stage);
  });

  document.querySelectorAll("[data-stage-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.stagePanel === stage);
  });

  persistBmmForm();
  renderBmmSummary();
  renderTeacherReview();
  document.querySelector("#bmm-workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function hydrateBmmForm() {
  Object.entries(bmmState).forEach(([name, value]) => {
    if (name === "influencers") {
      document.querySelectorAll(`[name="${name}"]`).forEach((input) => {
        input.checked = Array.isArray(value) && value.includes(input.value);
      });
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
  const data = new FormData(form);
  const now = new Date().toISOString();
  bmmState = {
    ...EMPTY_STATE,
    business_goal: data.get("business_goal") || "",
    affected_users: data.get("affected_users") || "",
    critical_service: data.get("critical_service") || "",
    influencers: data.getAll("influencers"),
    current_capabilities: [],
    capability_gaps: [],
    priority_risk: data.get("priority_risk") || "",
    business_impact: data.get("business_impact") || "",
    technology_dependency: data.get("technology_dependency") || "",
    student_conclusion: data.get("student_conclusion") || "",
    business_protection: data.get("business_protection") || "",
    risk_reason: data.get("risk_reason") || "",
    session_started_at: bmmState.session_started_at || now,
    session_updated_at: now,
  };
  localStorage.setItem(BMM_STORAGE_KEY, JSON.stringify(bmmState));
}

function loadBmmState() {
  try {
    const saved = JSON.parse(localStorage.getItem(BMM_STORAGE_KEY) || "{}");
    return { ...EMPTY_STATE, ...saved };
  } catch (error) {
    return { ...EMPTY_STATE };
  }
}

function renderBmmSummary() {
  const rows = [
    ["Resultado critico identificado", bmmState.business_goal],
    ["Usuarios o actores afectados", bmmState.affected_users],
    ["Servicio o capacidad critica", bmmState.critical_service],
    ["Influenciadores seleccionados", bmmState.influencers.join(", ")],
    ["Riesgo prioritario", bmmState.priority_risk],
    ["Dependencia tecnologica", bmmState.technology_dependency],
    ["Impacto de negocio", bmmState.business_impact],
  ];

  const summary = document.querySelector("#bmm-summary");
  if (summary) {
    summary.innerHTML = rows.map(([label, value]) => renderBmmMapItem(label, value)).join("");
  }

  const finalCard = document.querySelector("#bmm-final-card");
  if (finalCard) {
    finalCard.innerHTML = [
      ...rows,
      ["Conclusion escrita por el equipo", bmmState.student_conclusion],
    ].map(([label, value]) => renderBmmMapItem(label, value)).join("");
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
    ["1. Resultado que necesita mantener", bmmState.business_goal],
    ["2. Usuarios o actores que dependen del resultado", bmmState.affected_users],
    ["3. Servicio o capacidad mas importante", bmmState.critical_service],
    ["4. Impacto si el servicio deja de funcionar", bmmState.business_impact],
    ["5. Que necesita proteger o asegurar", bmmState.business_protection],
    ["6. Influenciadores seleccionados", bmmState.influencers.join(", ")],
    ["7. Factor prioritario", bmmState.priority_risk],
    ["8. Explicacion del factor prioritario", bmmState.risk_reason],
    ["9. Dependencia tecnologica identificada", bmmState.technology_dependency],
    ["10. Conclusion final", bmmState.student_conclusion],
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

function answerForStage(stage) {
  if (stage === "business_goal") {
    return [
      bmmState.business_goal,
      bmmState.affected_users,
      bmmState.critical_service,
      bmmState.business_impact,
      bmmState.business_protection,
    ].filter(Boolean).join("\n");
  }
  if (stage === "influencers") {
    return [
      `Influenciadores: ${bmmState.influencers.join(", ")}`,
      `Factor prioritario: ${bmmState.priority_risk}`,
      bmmState.risk_reason,
    ].filter(Boolean).join("\n");
  }
  return [
    bmmState.technology_dependency,
    bmmState.student_conclusion,
  ].filter(Boolean).join("\n");
}

function compactPreviousAnswers() {
  return [
    { stage: "business_goal", answer: bmmState.business_goal },
    { stage: "affected_users", answer: bmmState.affected_users },
    { stage: "critical_service", answer: bmmState.critical_service },
    { stage: "priority_risk", answer: bmmState.priority_risk },
  ].filter((item) => item.answer);
}

function renderAiFeedback(panel, mentor, rateLimit) {
  const reasoning = mentor.reasoning || {};
  const remaining = rateLimit && rateLimit.remaining !== null ? rateLimit.remaining : null;
  const limit = rateLimit && rateLimit.limit !== null ? rateLimit.limit : null;
  panel.hidden = false;
  panel.innerHTML = `
    <article class="ai-card">
      <p class="eyebrow">Mentor IA - Nivel de desarrollo del razonamiento</p>
      ${remaining !== null ? `<p class="ai-rate-limit">Consultas disponibles en esta sesion: ${escapeHtml(remaining)}${limit !== null ? ` / ${escapeHtml(limit)}` : ""}</p>` : ""}
      <div class="ai-feedback-grid">
        ${renderAiFeedbackBlock("Lo que estas haciendo bien", mentor.strength)}
        ${renderAiFeedbackBlock("Que puedes profundizar", mentor.gap)}
        ${renderAiFeedbackBlock("Pregunta para continuar", mentor.socratic_question)}
        ${renderAiFeedbackBlock("Estado de evidencia", mentor.evidence_note)}
      </div>
      ${mentor.classification_prompt ? `<p class="ai-classification">${escapeHtml(mentor.classification_prompt)}</p>` : ""}
      <div class="reasoning-meter-grid">
        ${renderReasoningMeter("Negocio", reasoning.business)}
        ${renderReasoningMeter("Evidencia", reasoning.evidence)}
        ${renderReasoningMeter("Relacion causal", reasoning.causal_link)}
        ${renderReasoningMeter("Especificidad", reasoning.specificity)}
        ${renderReasoningMeter("Profundidad", reasoning.depth)}
      </div>
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
  return `
    <div class="reasoning-meter">
      <span>${escapeHtml(label)}</span>
      <strong>${"■".repeat(safeValue)}${"□".repeat(4 - safeValue)}</strong>
    </div>
  `;
}

function renderAiMessage(panel, message) {
  panel.hidden = false;
  panel.innerHTML = `<div class="ai-mentor-panel-message">${escapeHtml(message)}</div>`;
}

function renderAiLimit(panel) {
  renderAiMessage(panel, "Has alcanzado el limite de consultas del mentor para esta sesion.");
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
