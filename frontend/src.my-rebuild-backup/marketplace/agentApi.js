// agentApi.js — Thin client for the agent-server.
//
// The backend runs at VITE_AGENT_API_URL (default http://localhost:4000) for
// HTTP and VITE_AGENT_WS_URL (default ws://localhost:4001) for live events.

const HTTP = (import.meta.env.VITE_AGENT_API_URL || 'http://localhost:4000').replace(/\/$/, '');
// WS shares the same port as HTTP (via HTTP Upgrade on /ws).
const WS   = import.meta.env.VITE_AGENT_WS_URL
  || HTTP.replace(/^http/, 'ws') + '/ws';

async function j(path, opts = {}) {
  const res = await fetch(`${HTTP}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export function agentApiBase() { return HTTP; }
export function agentWsUrl()   { return WS; }

export function checkHealth() {
  return j('/api/health');
}

export function listAgents() {
  return j('/api/agents').then((r) => r.agents || []);
}

export function getAgent(id) {
  return j(`/api/agents/${id}`);
}

export function createAgent(payload) {
  return j('/api/agents', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.agent);
}

export function deleteAgent(id) {
  return j(`/api/agents/${id}`, { method: 'DELETE' });
}

export function listNegotiations() {
  return j('/api/negotiations').then((r) => r.negotiations || []);
}

export function getNegotiation(id) {
  return j(`/api/negotiations/${id}`).then((r) => r.negotiation);
}

/**
 * Open a live WebSocket. Returns a cleanup fn.
 * @param {(event: object) => void} onEvent
 */
export function connectAgentWs(onEvent) {
  let ws;
  let closed = false;
  let reconnectTimer = null;

  function open() {
    if (closed) return;
    ws = new WebSocket(WS);
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data)); } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (closed) return;
      reconnectTimer = setTimeout(open, 2000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  open();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws && ws.readyState <= 1) try { ws.close(); } catch {}
  };
}
