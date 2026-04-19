/**
 * Planbok MPC Wallet Infrastructure — Service Layer
 * Replaces TWAK. Provides wallet creation, balance queries, fee estimation,
 * transaction signing, and transfers via Planbok's 2-of-2 MPC API.
 *
 * In production, the agent server proxies these calls.
 * Frontend uses this for status display and direct wallet reads.
 */

const PLANBOK_API = import.meta.env.VITE_PLANBOK_API_URL || 'http://localhost:4000/api';

// Map our chain IDs to Planbok chain types
const CHAIN_MAP = {
  146: { type: 'evm', network: 'sonic', symbol: 'S' },
  14601: { type: 'evm', network: 'sonic-testnet', symbol: 'S' },
  5318007: { type: 'evm', network: 'reactive', symbol: 'REACT' },
  11155111: { type: 'evm', network: 'sepolia', symbol: 'ETH' },
  84532: { type: 'evm', network: 'base-sepolia', symbol: 'ETH' },
  114: { type: 'evm', network: 'coston', symbol: 'FLR' },
  1597: { type: 'evm', network: 'coston2', symbol: 'FLR' },
};

let planbokAvailable = null;

async function fetchPlanbok(path, options = {}) {
  const token = localStorage.getItem('planbok_token') || '';
  const res = await fetch(`${PLANBOK_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Planbok API error: ${res.status}`);
  }
  return res.json();
}

/**
 * Check if Planbok agent server is reachable
 */
export async function isPlanbokOnline() {
  if (planbokAvailable !== null) return planbokAvailable;
  try {
    await fetch(`${PLANBOK_API}/health`, { signal: AbortSignal.timeout(3000) });
    planbokAvailable = true;
  } catch {
    planbokAvailable = false;
  }
  setTimeout(() => { planbokAvailable = null; }, 30000);
  return planbokAvailable;
}

// ---- Auth ----

export async function signup(email, password) {
  const data = await fetchPlanbok('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.token) localStorage.setItem('planbok_token', data.token);
  return data;
}

export async function login(email, password) {
  const data = await fetchPlanbok('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.token) localStorage.setItem('planbok_token', data.token);
  return data;
}

export async function getMe() {
  return fetchPlanbok('/auth/me');
}

// ---- Wallets ----

export async function createWallet(chains = ['evm']) {
  return fetchPlanbok('/wallets', {
    method: 'POST',
    body: JSON.stringify({ chains }),
  });
}

export async function getWallets() {
  return fetchPlanbok('/wallets');
}

export async function getWalletBalances(walletId) {
  return fetchPlanbok(`/wallets/${walletId}/balances`);
}

// ---- Transactions ----

export async function estimateFee({ walletId, to, amount, token, chainId }) {
  const chain = CHAIN_MAP[chainId];
  return fetchPlanbok('/transactions/estimate-fee', {
    method: 'POST',
    body: JSON.stringify({
      walletId,
      to,
      amount: amount.toString(),
      token,
      chain: chain?.type || 'evm',
      network: chain?.network || 'sepolia',
    }),
  });
}

export async function transfer({ walletId, to, amount, token, chainId }) {
  const chain = CHAIN_MAP[chainId];
  return fetchPlanbok('/transactions/transfer', {
    method: 'POST',
    body: JSON.stringify({
      walletId,
      to,
      amount: amount.toString(),
      token,
      chain: chain?.type || 'evm',
      network: chain?.network || 'sepolia',
    }),
  });
}

export async function cancelTransaction(txId) {
  return fetchPlanbok(`/transactions/${txId}/cancel`, { method: 'POST' });
}

export async function accelerateTransaction(txId) {
  return fetchPlanbok(`/transactions/${txId}/accelerate`, { method: 'POST' });
}

// ---- Signing ----

export async function signMessage(walletId, message) {
  return fetchPlanbok('/sign/message', {
    method: 'POST',
    body: JSON.stringify({ walletId, message }),
  });
}

export async function signTypedData(walletId, typedData) {
  return fetchPlanbok('/sign/typed-data', {
    method: 'POST',
    body: JSON.stringify({ walletId, typedData }),
  });
}

// ---- Agent Server (WebSocket) ----

// Prefer explicit VITE_AGENT_WS_URL. Otherwise derive from VITE_AGENT_API_URL
// by converting http(s) → ws(s) and stripping the /api suffix — works when
// HTTP and WS share a single port (Railway/Fly/Render/etc.).
const WS_URL = (() => {
  if (import.meta.env.VITE_AGENT_WS_URL) return import.meta.env.VITE_AGENT_WS_URL;
  const api = import.meta.env.VITE_AGENT_API_URL;
  if (api) {
    return api.replace(/^http/, 'ws').replace(/\/api\/?$/, '');
  }
  return 'ws://localhost:4001';
})();

export function connectAgentWS(onMessage, onOpen, onClose) {
  let ws = null;
  let reconnectTimer = null;
  let closed = false;

  function connect() {
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      if (onClose) onClose();
      if (!closed) reconnectTimer = setTimeout(connect, 5000);
      return;
    }

    ws.onopen = () => {
      if (onOpen) onOpen();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      if (onClose) onClose();
      if (!closed) reconnectTimer = setTimeout(connect, 5000);
    };

    ws.onerror = () => { /* onclose will fire */ };
  }

  connect();

  return {
    send: (type, payload) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...payload }));
      }
    },
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    },
  };
}

// ---- Agent Server API ----

const AGENT_API = import.meta.env.VITE_AGENT_API_URL || 'http://localhost:4000/api';

async function fetchAgent(path, options = {}) {
  // Agent creation involves Planbok MPC wallet DKG (20-40s) + funding tx
  // (10-30s). Railway cold starts add ~5s. Use a 90s timeout for writes,
  // 15s for reads.
  const defaultTimeout = (options.method && options.method !== 'GET') ? 90_000 : 15_000;
  const res = await fetch(`${AGENT_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(defaultTimeout),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `Agent API error: ${res.status}`);
  }
  return res.json();
}

export async function checkAgentServer() {
  try {
    const data = await fetchAgent('/health');
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function createBackendAgent({ name, strategy, sellToken, buyToken, sellAmount, priceMin, priceMax, maxRounds, fundAmount }) {
  return fetchAgent('/agents', {
    method: 'POST',
    body: JSON.stringify({ name, strategy, sellToken, buyToken, sellAmount, priceMin, priceMax, maxRounds, fundAmount }),
  });
}

export async function listBackendAgents() {
  return fetchAgent('/agents');
}

export async function deleteBackendAgent(agentId) {
  return fetchAgent(`/agents/${agentId}`, { method: 'DELETE' });
}

export async function startNegotiation(agentAId, agentBId) {
  return fetchAgent('/negotiate', {
    method: 'POST',
    body: JSON.stringify({ agentA: agentAId, agentB: agentBId }),
  });
}

export async function getNegotiation(negId) {
  return fetchAgent(`/negotiations/${negId}`);
}

export async function listNegotiations() {
  return fetchAgent('/negotiations');
}

export async function settleNegotiationManual(negId) {
  return fetchAgent(`/negotiations/${negId}/settle`, { method: 'POST' });
}

// ---- Price Helpers (fallback to tokenlist basePrice) ----

export function computeBaseRate(sellToken, buyToken) {
  if (!sellToken?.basePrice || !buyToken?.basePrice) return 1;
  return sellToken.basePrice / buyToken.basePrice;
}

export async function getBestRate(sellToken, buyToken) {
  return {
    rate: computeBaseRate(sellToken, buyToken),
    sellUsd: sellToken.basePrice || 0,
    buyUsd: buyToken.basePrice || 0,
    source: 'tokenlist-base',
  };
}

export { CHAIN_MAP, PLANBOK_API, WS_URL, AGENT_API };
