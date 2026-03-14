// Background service worker — API proxy for authenticated server requests
// and video index storage for the bookmarks page.

// --- Video index relay ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "video-index-updated") {
    chrome.storage.local.set({ "video-index": msg.payload });
    return;
  }

  // --- Auth state ---
  if (msg.type === "get-auth") {
    chrome.storage.local.get(["session-token", "username"], (result) => {
      sendResponse({
        authenticated: !!result["session-token"],
        username: result["username"],
      });
    });
    return true; // async sendResponse
  }

  // --- Login ---
  if (msg.type === "login") {
    handleLogin(msg.username, msg.password).then(sendResponse);
    return true;
  }

  // --- Logout ---
  if (msg.type === "logout") {
    chrome.storage.local.remove(["session-token", "username"], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // --- API proxy ---
  if (msg.type === "api-request") {
    handleApiRequest(msg.path, msg.body).then(sendResponse);
    return true;
  }
});

// Default server URL — overridable via chrome.storage.local "server-url"
const DEFAULT_SERVER_URL = "https://ytsub-v5.hiroshi.workers.dev";

async function getServerUrl() {
  const result = await chrome.storage.local.get("server-url");
  return result["server-url"] || DEFAULT_SERVER_URL;
}

async function getToken() {
  const result = await chrome.storage.local.get("session-token");
  return result["session-token"];
}

async function handleLogin(username, password) {
  try {
    const serverUrl = await getServerUrl();
    if (!serverUrl) return { error: "Server URL not configured" };

    const res = await fetch(`${serverUrl}/api/auth.login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.message || "Login failed" };
    }

    const data = await res.json();
    await chrome.storage.local.set({
      "session-token": data.token,
      username,
    });
    return { ok: true };
  } catch (e) {
    return { error: e.message || "Network error" };
  }
}

async function handleApiRequest(path, body) {
  try {
    const serverUrl = await getServerUrl();
    if (!serverUrl) return { error: "Server URL not configured" };

    const token = await getToken();
    const headers = { "content-type": "application/json" };
    if (token) headers["authorization"] = `Bearer ${token}`;

    const res = await fetch(`${serverUrl}/api/${path}`, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: data.message || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { data };
  } catch (e) {
    return { error: e.message || "Network error" };
  }
}
