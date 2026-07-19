/* ═══════════════════════════════════════════════════════════════
   api.js — ORION REST API Client
   Auto-authenticates as demo operator, no login form needed.
   ═══════════════════════════════════════════════════════════════ */

const OrionAPI = (() => {
  const BASE_URL = 'https://orion-backend-rcgw.onrender.com';
  let authToken = null;

  async function login() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@orion.io', password: 'orion123' })
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    authToken = data.token;
    return { token: authToken, user: data.user };
  }

  function getToken() { return authToken; }
  function getBaseUrl() { return BASE_URL; }

  async function triggerPanic() {
    if (!authToken) throw new Error('Not authenticated');
    const res = await fetch(`${BASE_URL}/api/assets/trigger-panic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({})
    });
    if (!res.ok) throw new Error(`Panic trigger failed: ${res.status}`);
    return res.json();
  }

  return { login, getToken, getBaseUrl, triggerPanic };
})();
