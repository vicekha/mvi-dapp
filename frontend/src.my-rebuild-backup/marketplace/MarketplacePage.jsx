import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Bot, AlertTriangle, RefreshCcw, Wifi, WifiOff } from 'lucide-react';

import AgentConfigurator from './AgentConfigurator.jsx';
import ArenaView from './ArenaView.jsx';
import NegotiationPanel from './NegotiationPanel.jsx';
import {
  checkHealth, listAgents, listNegotiations, createAgent,
  getNegotiation, connectAgentWs,
} from './agentApi.js';

// ---- Reducer for the live marketplace state ----
const initial = {
  agents: {},        // id -> agent
  negotiations: {},  // id -> negotiation (may be partial until hydrated)
  selectedNegId: null,
};

function reducer(s, action) {
  switch (action.type) {
    case 'SET_AGENTS': {
      const m = {};
      for (const a of action.agents) m[a.id] = a;
      return { ...s, agents: m };
    }
    case 'UPSERT_AGENT':
      return { ...s, agents: { ...s.agents, [action.agent.id]: { ...s.agents[action.agent.id], ...action.agent } } };
    case 'REMOVE_AGENT': {
      const { [action.id]: _, ...rest } = s.agents;
      return { ...s, agents: rest };
    }
    case 'SET_NEGOTIATIONS': {
      const m = {};
      for (const n of action.negotiations) m[n.id] = { ...s.negotiations[n.id], ...n };
      return { ...s, negotiations: m };
    }
    case 'UPSERT_NEG':
      return { ...s, negotiations: { ...s.negotiations, [action.neg.id]: { ...s.negotiations[action.neg.id], ...action.neg } } };
    case 'APPEND_MSG': {
      const prev = s.negotiations[action.negId];
      if (!prev) return s;
      return {
        ...s,
        negotiations: {
          ...s.negotiations,
          [action.negId]: {
            ...prev,
            messages: [...(prev.messages || []), action.message],
            messageCount: (prev.messageCount || 0) + 1,
          },
        },
      };
    }
    case 'PATCH_NEG': {
      const prev = s.negotiations[action.negId];
      if (!prev) return s;
      return { ...s, negotiations: { ...s.negotiations, [action.negId]: { ...prev, ...action.patch } } };
    }
    case 'SELECT_NEG':
      return { ...s, selectedNegId: action.id };
    default:
      return s;
  }
}

/**
 * MarketplacePage — the full AI-vs-AI trading marketplace.
 * Only shows real backend agents; negotiations happen automatically on the
 * server when compatible pairs exist.
 */
export default function MarketplacePage({ tokens, connectedAddress }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [health, setHealth] = useState({ loading: true });
  const [wsConnected, setWsConnected] = useState(false);
  const [hydrateErr, setHydrateErr] = useState(null);
  const pendingNegFetch = useRef(new Set());

  // ---- Initial hydration ----
  const hydrate = useCallback(async () => {
    setHydrateErr(null);
    try {
      const [h, agents, negs] = await Promise.all([
        checkHealth().catch((e) => ({ ok: false, error: e.message })),
        listAgents().catch(() => []),
        listNegotiations().catch(() => []),
      ]);
      setHealth({ loading: false, ...h });
      dispatch({ type: 'SET_AGENTS', agents });
      dispatch({ type: 'SET_NEGOTIATIONS', negotiations: negs });
    } catch (e) {
      setHealth({ loading: false, ok: false, error: e.message });
      setHydrateErr(e.message);
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  // ---- Background refresh so we catch anything the WS missed ----
  useEffect(() => {
    const t = setInterval(() => {
      listAgents().then((a) => dispatch({ type: 'SET_AGENTS', agents: a })).catch(() => {});
      listNegotiations().then((n) => dispatch({ type: 'SET_NEGOTIATIONS', negotiations: n })).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  // ---- Fetch full negotiation (with messages) when we first see its id ----
  const hydrateNegotiation = useCallback(async (id) => {
    if (pendingNegFetch.current.has(id)) return;
    pendingNegFetch.current.add(id);
    try {
      const full = await getNegotiation(id);
      if (full) dispatch({ type: 'UPSERT_NEG', neg: full });
    } catch { /* ignore */ }
    finally { pendingNegFetch.current.delete(id); }
  }, []);

  // ---- WebSocket events ----
  useEffect(() => {
    const disconnect = connectAgentWs((ev) => {
      switch (ev.type) {
        case 'hello':
          setWsConnected(true);
          break;
        case 'agent_joined':
        case 'agent_funded':
          dispatch({ type: 'UPSERT_AGENT', agent: ev.agent });
          break;
        case 'agent_removed':
          dispatch({ type: 'REMOVE_AGENT', id: ev.agentId });
          break;
        case 'negotiation_started':
          dispatch({ type: 'UPSERT_NEG', neg: { ...ev.negotiation } });
          if (!state.selectedNegId) dispatch({ type: 'SELECT_NEG', id: ev.negotiation.id });
          break;
        case 'negotiation_message':
          dispatch({ type: 'APPEND_MSG', negId: ev.negotiationId, message: ev.message });
          break;
        case 'negotiation_agreed':
          dispatch({ type: 'PATCH_NEG', negId: ev.negotiationId, patch: { status: 'agreed', agreed: ev.agreed } });
          break;
        case 'negotiation_settling':
          dispatch({ type: 'PATCH_NEG', negId: ev.negotiationId, patch: { status: 'settling' } });
          break;
        case 'negotiation_settled':
          dispatch({
            type: 'PATCH_NEG',
            negId: ev.negotiationId,
            patch: {
              status: 'settled',
              settlement: {
                orderId: ev.orderId,
                createTxHash: ev.createTxHash,
                fulfillTxHash: ev.fulfillTxHash,
              },
            },
          });
          break;
        case 'negotiation_settlement_failed':
          dispatch({ type: 'PATCH_NEG', negId: ev.negotiationId, patch: { status: 'settlement_failed', failureReason: ev.error } });
          break;
        case 'negotiation_failed':
          dispatch({ type: 'PATCH_NEG', negId: ev.negotiationId, patch: { status: 'failed', failureReason: ev.reason } });
          break;
        default:
          break;
      }
    });

    // Reconnect also flips state
    const probe = setInterval(() => {
      // WS lib reconnects internally — just reflect state via a HEAD probe
      checkHealth().then(() => setWsConnected(true)).catch(() => setWsConnected(false));
    }, 15_000);

    return () => { disconnect(); clearInterval(probe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a new negotiation arrives via a `_message` event but we don't have its
  // record yet, fetch it lazily.
  useEffect(() => {
    for (const id of Object.keys(state.negotiations)) {
      const n = state.negotiations[id];
      if (n && !n.messages && n.messageCount > 0) hydrateNegotiation(id);
    }
  }, [state.negotiations, hydrateNegotiation]);

  const agentsList = useMemo(() => Object.values(state.agents), [state.agents]);
  const negotiationsList = useMemo(() => Object.values(state.negotiations).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [state.negotiations]);
  const selectedNeg = state.selectedNegId ? state.negotiations[state.selectedNegId] : null;

  async function handleCreateAgent(payload) {
    const agent = await createAgent(payload);
    dispatch({ type: 'UPSERT_AGENT', agent });
    return agent;
  }

  return (
    <div className="mp-root">
      <div className="mp-topbar">
        <div className="mp-topbar-title">
          <Bot size={18} /> AI Agent Marketplace
        </div>
        <div className="mp-topbar-status">
          <span className={`mp-conn ${wsConnected && health.ok ? 'ok' : 'bad'}`}>
            {wsConnected && health.ok ? <Wifi size={12} /> : <WifiOff size={12} />}
            {wsConnected && health.ok
              ? `connected · ${health.planbok ? 'planbok' : 'local'} wallets`
              : 'agent-server offline'}
          </span>
          <button type="button" className="mp-refresh" onClick={hydrate} title="Refresh">
            <RefreshCcw size={12} />
          </button>
        </div>
      </div>

      {!health.loading && !health.ok && (
        <div className="mp-server-warning">
          <AlertTriangle size={14} />
          <span>
            Agent backend not reachable. Start it with <code>cd agent-server && npm run dev</code>.
          </span>
        </div>
      )}

      <div className="mp-body">
        <div className="mp-col-left">
          <AgentConfigurator
            tokens={tokens}
            connectedAddress={connectedAddress}
            onCreated={handleCreateAgent}
          />
        </div>

        <div className="mp-col-mid">
          <ArenaView
            agents={agentsList}
            negotiations={negotiationsList}
            selectedNegId={state.selectedNegId}
            onSelectNeg={(id) => dispatch({ type: 'SELECT_NEG', id })}
            connectedAddress={connectedAddress}
          />
        </div>

        <div className="mp-col-right">
          <NegotiationPanel negotiation={selectedNeg} agents={agentsList} />
        </div>
      </div>

      {hydrateErr && <div className="mp-error">{hydrateErr}</div>}
    </div>
  );
}
