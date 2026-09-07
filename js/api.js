const API_BASE_URL = "https://acatherinem.pythonanywhere.com/api";
const SESSION_KEY = "infrasim_session";


function getSessionToken() {
  return sessionStorage.getItem(SESSION_KEY);
}


function setSessionToken(token) {
  sessionStorage.setItem(SESSION_KEY, token);
}


function clearSessionToken() {
  sessionStorage.removeItem(SESSION_KEY);
}


function apiHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  const token = getSessionToken();
  if (token) {
    headers["X-Student-Session"] = token;
  }
  return headers;
}


async function parseApiResponse(response, fallbackMessage) {
  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    const failed = new Error(fallbackMessage);
    failed.status = response.status;
    throw failed;
  }
  if (!response.ok) {
    const error = new Error(payload.error || fallbackMessage);
    error.status = response.status;
    throw error;
  }
  return payload;
}


async function loginStudent(email) {
  const response = await fetch(`${API_BASE_URL}/student/login`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ email }),
  });
  const payload = await parseApiResponse(response, "No fue posible ingresar.");
  setSessionToken(payload.session_token);
  return payload;
}


async function fetchStudentDashboard() {
  const response = await fetch(`${API_BASE_URL}/student/dashboard`, {
    headers: apiHeaders(),
  });
  return parseApiResponse(response, "No fue posible cargar el panel.");
}


async function fetchStudentHistory() {
  const response = await fetch(`${API_BASE_URL}/student/history`, {
    headers: apiHeaders(),
  });
  return parseApiResponse(response, "No fue posible cargar el historial.");
}


async function fetchStudentCompetencies() {
  const response = await fetch(`${API_BASE_URL}/student/competencies`, {
    headers: apiHeaders(),
  });
  return parseApiResponse(response, "No fue posible cargar las competencias.");
}


async function fetchAttemptDetail(attemptId) {
  const response = await fetch(`${API_BASE_URL}/student/attempts/${attemptId}`, {
    headers: apiHeaders(),
  });
  return parseApiResponse(response, "No fue posible cargar el detalle del simulacro.");
}


async function logoutStudent() {
  const response = await fetch(`${API_BASE_URL}/student/logout`, {
    method: "POST",
    headers: apiHeaders(),
  });
  const payload = await parseApiResponse(response, "No fue posible cerrar la sesion.");
  clearSessionToken();
  return payload;
}


async function fetchScenarioOptions() {
  const response = await fetch(`${API_BASE_URL}/config/options`);

  if (!response.ok) {
    throw new Error("No fue posible cargar las opciones del escenario.");
  }

  return response.json();
}


async function fetchArchetypes() {
  const response = await fetch(`${API_BASE_URL}/archetypes`);

  if (!response.ok) {
    throw new Error("No fue posible cargar los arquetipos.");
  }

  return response.json();
}


async function generateScenario(configuration, seed) {
  const response = await fetch(`${API_BASE_URL}/scenario/generate`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      configuration,
      seed,
    }),
  });

  return (await parseApiResponse(response, "No fue posible generar el escenario.")).scenario;
}


async function drawScenario() {
  const response = await fetch(`${API_BASE_URL}/scenario/draw`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({}),
  });

  return parseApiResponse(response, "No fue posible sortear el escenario.");
}


async function generateQuiz(scenarioId) {
  const response = await fetch(`${API_BASE_URL}/quiz/generate`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ scenario_id: scenarioId }),
  });

  return parseApiResponse(response, "No fue posible generar el simulacro.");
}


async function finishQuiz(quizId, answers) {
  const response = await fetch(`${API_BASE_URL}/quiz/finish`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ quiz_id: quizId, answers }),
  });

  return parseApiResponse(response, "No fue posible finalizar el simulacro.");
}
