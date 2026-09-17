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
    throw new Error(payload.error || fallbackMessage);
  }
  return payload;
}

async function loginNotas(email, accessCode) {
  const response = await fetch(`${API_BASE_URL}/notas/login`, {
    method: "POST",
    credentials: "include",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, access_code: accessCode}),
  });
  return parseApiResponse(response, "No fue posible completar la operación. Intenta nuevamente.");
}

async function fetchNotasResultado() {
  const response = await fetch(`${API_BASE_URL}/notas/resultado`, {
    credentials: "include",
  });
  return parseApiResponse(response, "No fue posible completar la operación. Intenta nuevamente.");
}
