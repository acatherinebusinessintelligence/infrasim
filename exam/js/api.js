const API_ENVIRONMENTS = {
  development: "http://127.0.0.1:5000/api",
  production: "https://acatherinem.pythonanywhere.com/api",
};

function resolveApiEnvironment() {
  const host = window.location.hostname;
  if (host === "127.0.0.1" || host === "localhost") {
    return "development";
  }
  return "production";
}

const API_BASE_URL = API_ENVIRONMENTS[resolveApiEnvironment()];

async function parseApiResponse(response, fallbackMessage) {
  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(fallbackMessage);
  }
  if (!response.ok) {
    const failed = new Error(payload.error || fallbackMessage);
    failed.status = response.status;
    failed.payload = payload;
    throw failed;
  }
  return payload;
}

async function loginExam(email, accessCode) {
  const response = await fetch(`${API_BASE_URL}/exam/login`, {
    method: "POST",
    credentials: "include",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, access_code: accessCode}),
  });
  return parseApiResponse(response, "No fue posible validar el acceso.");
}

async function fetchExamState() {
  const response = await fetch(`${API_BASE_URL}/exam/state`, {
    credentials: "include",
  });
  return parseApiResponse(response, "No fue posible consultar el estado.");
}

async function startExam() {
  const response = await fetch(`${API_BASE_URL}/exam/start`, {
    method: "POST",
    credentials: "include",
  });
  return parseApiResponse(response, "No fue posible iniciar el examen.");
}

async function fetchExamQuiz() {
  const response = await fetch(`${API_BASE_URL}/exam/quiz`, {
    method: "POST",
    credentials: "include",
  });
  return parseApiResponse(response, "No fue posible cargar las preguntas.");
}

async function saveExamAnswer(questionId, answer) {
  const response = await fetch(`${API_BASE_URL}/exam/answer`, {
    method: "PUT",
    credentials: "include",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({question_id: questionId, answer}),
  });
  return parseApiResponse(response, "No fue posible guardar la respuesta.");
}
