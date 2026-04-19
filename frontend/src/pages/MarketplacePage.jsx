import React, { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';
import { useWeb3ModalAccount } from '@web3modal/ethers/react';
import { NETWORKS } from '../config/networks.jsx';
import {
  checkAgentServer, connectAgentWS,
  createBackendAgent, listBackendAgents, startNegotiation, getNegotiation,
  deleteBackendAgent,
} from '../config/planbok.js';
import { STRATEGIES } from '../engine/agentPersonalities.js';
import { NEG_STATUS, MSG_TYPE } from '../engine/negotiation.js';
import AgentConfigurator from '../components/marketplace/AgentConfigurator';
import MarketplaceArena from '../components/marketplace/MarketplaceArena';
import NegotiationPanel from '../components/marketplace/NegotiationPanel';
import SettlementModal from '../components/marketplace/SettlementModal';

const initialState = {
  phase: 'configure', // configure | marketplace | negotiating | settled
  userAgent: null,       // backend agent object (Agent A)
  npcAgents: [],         // other backend agents
  negotiation: null,     // { counterparty, round, history, status, agreedPrice, fairRate, negId }
  settlement: null,
  showSettlement: false,
  deploying: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_DEPLOYING':
      return { ...state, deploying: action.value };

    case 'DEPLOY_AGENT': {
      // No local NPCs — other users' real backend agents populate the arena via
      // listBackendAgents + agent_joined WS events, and auto-match on compatibility.
      return {
        ...state,
        phase: 'marketplace',
        userAgent: action.agent,
        npcAgents: [],
        deploying: false,
      };
    }

    case 'SET_NPC_AGENTS':
      return { ...state, npcAgents: action.agents };

    case 'ADD_NPC_AGENT': {
      // Don't duplicate or add self
      if (action.agent.id === state.userAgent?.id) return state;
      if (state.npcAgents.some(a => a.id === action.agent.id)) return state;
      return { ...state, npcAgents: [...state.npcAgents, action.agent] };
    }

    case 'REMOVE_AGENT': {
      // Remove from NPCs; if it's the user's own, also clear userAgent + drop back to configure
      if (state.userAgent?.id === action.agentId) {
        return {
          ...state,
          phase: 'configure',
          userAgent: null,
          negotiation: null,
          settlement: null,
          showSettlement: false,
        };
      }
      return {
        ...state,
        npcAgents: state.npcAgents.filter(a => a.id !== action.agentId),
      };
    }

    case 'START_NEGOTIATION': {
      return {
        ...state,
        phase: 'negotiating',
        negotiation: {
          negId: action.negId,
          counterparty: action.counterparty,
          round: 0,
          history: [
            {
              id: 'msg-system-start',
              sender: 'system',
              senderName: 'System',
              type: MSG_TYPE.SYSTEM,
              price: 0,
              message: `AI Negotiation started between ${state.userAgent.name} and ${action.counterparty.name}. Claude agents are negotiating...`,
              timestamp: new Date(),
            },
          ],
          status: NEG_STATUS.NEGOTIATING,
          agreedPrice: null,
          fairRate: action.fairRate || 1,
        },
      };
    }

    case 'NEGOTIATION_MESSAGE': {
      if (!state.negotiation) return state;
      const msg = action.message;
      // Map backend action to MSG_TYPE
      const typeMap = {
        make_offer: state.negotiation.history.length <= 2 ? MSG_TYPE.OFFER : MSG_TYPE.COUNTER,
        accept_offer: MSG_TYPE.ACCEPT,
        reject_and_withdraw: MSG_TYPE.REJECT,
      };
      const newMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sender: msg.sender,
        senderName: msg.senderName,
        type: typeMap[msg.action] || MSG_TYPE.INFO,
        price: msg.price || 0,
        message: msg.message || '',
        thinking: msg.thinking || '',
        timestamp: new Date(msg.timestamp || Date.now()),
      };
      return {
        ...state,
        negotiation: {
          ...state.negotiation,
          round: msg.round !== undefined ? msg.round + 1 : state.negotiation.round,
          history: [...state.negotiation.history, newMsg],
        },
      };
    }

    case 'NEGOTIATION_AGREED': {
      if (!state.negotiation) return state;
      const sellToken = state.userAgent.sellToken;
      const buyToken = state.userAgent.buyToken;
      const sellAmount = state.userAgent.sellAmount;
      const buyAmount = sellAmount * action.price;

      return {
        ...state,
        negotiation: {
          ...state.negotiation,
          status: NEG_STATUS.AGREED,
          agreedPrice: action.price,
        },
        settlement: {
          sellAmount: sellAmount.toFixed(sellToken.decimals > 6 ? 8 : 6),
          buyAmount: buyAmount.toFixed(buyToken.decimals > 6 ? 8 : 6),
          sellAmountRaw: sellAmount,
          buyAmountRaw: buyAmount,
          rate: action.price,
          sellToken,
          buyToken,
          negId: state.negotiation.negId,
        },
      };
    }

    case 'NEGOTIATION_FAILED': {
      if (!state.negotiation) return state;
      return {
        ...state,
        negotiation: {
          ...state.negotiation,
          status: NEG_STATUS.FAILED,
          history: [
            ...state.negotiation.history,
            {
              id: `msg-fail-${Date.now()}`,
              sender: 'system',
              senderName: 'System',
              type: MSG_TYPE.REJECT,
              price: 0,
              message: action.reason || 'Agents could not agree on a price.',
              timestamp: new Date(),
            },
          ],
        },
      };
    }

    case 'NEGOTIATION_SETTLING': {
      if (!state.negotiation) return state;
      return {
        ...state,
        negotiation: {
          ...state.negotiation,
          status: NEG_STATUS.SETTLING,
          history: [
            ...state.negotiation.history,
            {
              id: `msg-settling-${Date.now()}`,
              sender: 'system',
              senderName: 'System',
              type: MSG_TYPE.INFO,
              price: 0,
              message: 'Settling on-chain via AutoSwap...',
              timestamp: new Date(),
            },
          ],
        },
      };
    }

    case 'CANCEL_NEGOTIATION':
      return {
        ...state,
        phase: 'marketplace',
        negotiation: null,
        settlement: null,
      };

    case 'SHOW_SETTLEMENT':
      return { ...state, showSettlement: true };

    case 'HIDE_SETTLEMENT':
      return { ...state, showSettlement: false };

    case 'SETTLEMENT_SUCCESS': {
      return {
        ...state,
        phase: 'settled',
        showSettlement: false,
        settlement: {
          ...(state.settlement || {}),
          txHash: action.txHash,
          fulfillTxHash: action.fulfillTxHash,
          orderId: action.orderId,
          chainId: action.chainId || state.userAgent?.sellToken?.chainId,
          price: state.negotiation?.agreedPrice ?? state.settlement?.rate ?? null,
        },
        negotiation: state.negotiation ? {
          ...state.negotiation,
          status: NEG_STATUS.SETTLED,
          history: [
            ...state.negotiation.history,
            {
              id: `msg-settled-${Date.now()}`,
              sender: 'system',
              senderName: 'System',
              type: MSG_TYPE.ACCEPT,
              price: 0,
              message: `Trade settled on AutoSwap! TX: ${action.txHash?.slice(0, 14)}...${action.fulfillTxHash ? ` | Fulfill: ${action.fulfillTxHash.slice(0, 14)}...` : ''}`,
              timestamp: new Date(),
            },
          ],
        } : null,
      };
    }

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

export default function MarketplacePage() {
  const { address: account, chainId, isConnected } = useWeb3ModalAccount();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [serverOnline, setServerOnline] = useState(false);
  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const userAgentRef = useRef(null);
  useEffect(() => { userAgentRef.current = state.userAgent; }, [state.userAgent]);
  const negotiationRef = useRef(null);
  useEffect(() => { negotiationRef.current = state.negotiation; }, [state.negotiation]);

  const activeNetwork = NETWORKS.find(n => BigInt(n.id) === BigInt(chainId || 146)) || NETWORKS[0];
  const [targetNetwork, setTargetNetwork] = useState(activeNetwork);

  // Check agent server + connect WebSocket
  useEffect(() => {
    checkAgentServer().then(setServerOnline);

    const conn = connectAgentWS(
      (data) => {
        switch (data.type) {
          case 'agent_joined':
            dispatch({ type: 'ADD_NPC_AGENT', agent: normalizeAgent(data.agent, userAgentRef.current) });
            break;
          case 'agent_left':
            dispatch({ type: 'REMOVE_AGENT', agentId: data.agentId });
            break;
          case 'negotiation_started': {
            // Auto-enter negotiating phase if the user's agent is involved
            const me = userAgentRef.current?.id;
            if (!me) break;
            const { negotiation } = data;
            const isMine = negotiation.agentA.id === me || negotiation.agentB.id === me;
            if (!isMine) break;
            const counterparty = negotiation.agentA.id === me ? negotiation.agentB : negotiation.agentA;
            dispatch({
              type: 'START_NEGOTIATION',
              negId: negotiation.id,
              counterparty: normalizeAgent(counterparty, userAgentRef.current),
              fairRate: negotiation.fairRate,
            });
            break;
          }
          case 'negotiation_message':
            dispatch({ type: 'NEGOTIATION_MESSAGE', message: data.message });
            break;
          case 'negotiation_agreed':
            dispatch({ type: 'NEGOTIATION_AGREED', price: data.price });
            break;
          case 'negotiation_failed':
            dispatch({ type: 'NEGOTIATION_FAILED', reason: data.reason });
            break;
          case 'settlement_started': {
            // Only flip to "Settling..." if this negotiation belongs to the user.
            const myNeg = negotiationRef.current?.negId;
            if (data.negotiationId !== myNeg) break;
            dispatch({ type: 'NEGOTIATION_SETTLING' });
            break;
          }
          case 'negotiation_settled':
            dispatch({
              type: 'SETTLEMENT_SUCCESS',
              txHash: data.txHash,
              fulfillTxHash: data.fulfillTxHash,
              orderId: data.orderId,
              chainId: data.chainId,
            });
            break;
        }
      },
      () => setServerOnline(true),
      () => setServerOnline(false),
    );
    wsRef.current = conn;

    return () => conn?.close();
  }, []);

  // Restore user agent from localStorage on mount (survives page refresh)
  useEffect(() => {
    const storedId = localStorage.getItem('autoswap_user_agent_id');
    if (!storedId) return;
    listBackendAgents().then(data => {
      const all = data.agents || [];
      const mine = all.find(a => a.id === storedId);
      if (!mine) {
        localStorage.removeItem('autoswap_user_agent_id');
        return;
      }
      const userAgent = normalizeAgent(mine);
      const others = all.filter(a => a.id !== storedId).map(a => normalizeAgent(a, userAgent));
      dispatch({ type: 'DEPLOY_AGENT', agent: userAgent });
      dispatch({ type: 'SET_NPC_AGENTS', agents: others });
    }).catch(() => {});
  }, []);

  // Load existing agents from backend when entering marketplace
  useEffect(() => {
    if (state.phase !== 'marketplace' || !state.userAgent) return;

    listBackendAgents().then(data => {
      const others = (data.agents || [])
        .filter(a => a.id !== state.userAgent.id)
        .map(a => normalizeAgent(a, state.userAgent));
      dispatch({ type: 'SET_NPC_AGENTS', agents: others });
    }).catch(() => {});
  }, [state.phase, state.userAgent?.id]);

  // Poll negotiation status while negotiating
  useEffect(() => {
    if (!state.negotiation?.negId || state.negotiation.status === NEG_STATUS.SETTLED || state.negotiation.status === NEG_STATUS.FAILED) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const neg = await getNegotiation(state.negotiation.negId);
        if (!neg) return;

        // Sync new messages from backend
        const currentMsgCount = state.negotiation.history.length;
        const backendHistory = neg.history || [];

        // Push new messages we haven't seen
        backendHistory.forEach((msg, i) => {
          // Each backend message maps to 1 frontend message + the initial system msg
          if (i >= currentMsgCount - 1) {
            dispatch({
              type: 'NEGOTIATION_MESSAGE',
              message: msg,
            });
          }
        });

        // Handle terminal states
        if (neg.status === 'agreed' && neg.agreedPrice && state.negotiation.status === NEG_STATUS.NEGOTIATING) {
          dispatch({ type: 'NEGOTIATION_AGREED', price: neg.agreedPrice });
        } else if (neg.status === 'failed' && state.negotiation.status === NEG_STATUS.NEGOTIATING) {
          dispatch({ type: 'NEGOTIATION_FAILED', reason: 'Agents could not agree' });
        } else if (neg.status === 'settling' && state.negotiation.status !== NEG_STATUS.SETTLING) {
          dispatch({ type: 'NEGOTIATION_SETTLING' });
        } else if (neg.status === 'settled') {
          dispatch({
            type: 'SETTLEMENT_SUCCESS',
            txHash: neg.settlement?.txHash || '',
            fulfillTxHash: neg.settlement?.fulfillTxHash || '',
          });
        }
      } catch { /* server may be busy */ }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state.negotiation?.negId, state.negotiation?.status]);

  // Deploy agent to backend
  const handleDeploy = useCallback(async (config) => {
    dispatch({ type: 'SET_DEPLOYING', value: true });
    try {
      const agentName = `Agent-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const res = await createBackendAgent({
        name: agentName,
        strategy: config.strategy,
        sellToken: config.sellToken,
        buyToken: config.buyToken,
        sellAmount: config.sellAmount,
        priceMin: config.priceMin,
        priceMax: config.priceMax,
        maxRounds: config.maxRounds,
        fundAmount: config.fundAmount,
      });
      localStorage.setItem('autoswap_user_agent_id', res.agent.id);
      dispatch({
        type: 'DEPLOY_AGENT',
        agent: normalizeAgent(res.agent),
        chainId: activeNetwork.id,
        targetChainId: targetNetwork.id,
      });
    } catch (err) {
      alert(`Failed to create agent: ${err.message}`);
      dispatch({ type: 'SET_DEPLOYING', value: false });
    }
  }, [activeNetwork.id, targetNetwork.id]);

  // Create counterparty agent (Agent B) and start negotiation
  const handleSelectCounterparty = useCallback(async (npc) => {
    if (!state.userAgent) return;

    // If the NPC already exists on backend, start negotiation directly
    // Otherwise create it first
    let counterpartyId = npc.id;

    if (!npc.isBackend) {
      // NPC was generated locally — create on backend as counterparty
      try {
        dispatch({ type: 'SET_DEPLOYING', value: true });
        const res = await createBackendAgent({
          name: npc.name,
          strategy: npc.strategy,
          sellToken: npc.sellToken,
          buyToken: npc.buyToken,
          sellAmount: npc.sellAmount,
          priceMin: npc.priceMin,
          priceMax: npc.priceMax,
          maxRounds: npc.maxRounds || 12,
          fundAmount: npc.sellAmount, // Fund counterparty with their sell amount
        });
        counterpartyId = res.agent.id;
        npc = { ...npc, ...normalizeAgent(res.agent), isBackend: true };
        dispatch({ type: 'SET_DEPLOYING', value: false });
      } catch (err) {
        alert(`Failed to create counterparty: ${err.message}`);
        dispatch({ type: 'SET_DEPLOYING', value: false });
        return;
      }
    }

    // Start negotiation via backend
    try {
      const fairRate = (state.userAgent.sellToken.basePrice || 1) / (state.userAgent.buyToken.basePrice || 1);
      const res = await startNegotiation(state.userAgent.id, counterpartyId);
      dispatch({
        type: 'START_NEGOTIATION',
        negId: res.negotiationId,
        counterparty: npc,
        fairRate,
      });
    } catch (err) {
      alert(`Failed to start negotiation: ${err.message}`);
    }
  }, [state.userAgent]);

  // Remove/cancel agent — deletes from backend and clears from UI
  const handleRemoveAgent = useCallback(async (agentId) => {
    try {
      await deleteBackendAgent(agentId);
    } catch (err) {
      console.error('Failed to remove agent on backend:', err);
    }
    if (localStorage.getItem('autoswap_user_agent_id') === agentId) {
      localStorage.removeItem('autoswap_user_agent_id');
    }
    dispatch({ type: 'REMOVE_AGENT', agentId });
  }, []);

  // Settlement callback — auto-settles via backend
  const handleSettle = useCallback(() => {
    dispatch({ type: 'SHOW_SETTLEMENT' });
  }, []);

  return (
    <div className="marketplace-page">
      {/* Server status indicator */}
      <div className={`twak-status ${serverOnline ? 'online' : 'offline'}`}>
        {serverOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>Agent Server {serverOnline ? 'Connected' : 'Offline'}</span>
      </div>

      <div className="marketplace-layout">
        {/* Left Panel — Configuration */}
        <motion.div
          className="marketplace-left"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <AgentConfigurator
            onDeploy={handleDeploy}
            activeNetwork={activeNetwork}
            targetNetwork={targetNetwork}
            deploying={state.deploying}
          />
        </motion.div>

        {/* Center Panel — Arena */}
        <motion.div
          className="marketplace-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <MarketplaceArena
            userAgent={state.userAgent}
            npcAgents={state.npcAgents}
            onSelectCounterparty={handleSelectCounterparty}
            onRemoveAgent={handleRemoveAgent}
            activeNegotiation={state.negotiation}
          />
        </motion.div>

        {/* Right Panel — Negotiation */}
        <motion.div
          className="marketplace-right"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <NegotiationPanel
            negotiation={state.negotiation}
            userAgent={state.userAgent}
            counterparty={state.negotiation?.counterparty}
            fairRate={state.negotiation?.fairRate}
            onSettle={handleSettle}
            onCancel={() => dispatch({ type: 'CANCEL_NEGOTIATION' })}
          />
        </motion.div>
      </div>

      {/* Settlement Modal */}
      <SettlementModal
        isOpen={state.showSettlement}
        onClose={() => dispatch({ type: 'HIDE_SETTLEMENT' })}
        settlement={state.settlement}
        activeNetwork={activeNetwork}
        targetNetwork={targetNetwork}
        account={account}
        onSuccess={(txHash, fulfillTxHash) => dispatch({ type: 'SETTLEMENT_SUCCESS', txHash, fulfillTxHash })}
      />

      {/* Settled banner — shown after on-chain settlement completes */}
      {state.phase === 'settled' && state.settlement && (
        <SettledBanner
          settlement={state.settlement}
          userAgent={state.userAgent}
          counterparty={state.negotiation?.counterparty}
          onReset={() => dispatch({ type: 'RESET' })}
        />
      )}
    </div>
  );
}

function SettledBanner({ settlement, userAgent, counterparty, onReset }) {
  const chainId = settlement.chainId || userAgent?.sellToken?.chainId;
  const network = NETWORKS.find(n => BigInt(n.id) === BigInt(chainId || 0));
  const explorer = network?.explorerUrl || 'https://sepolia.etherscan.io';
  const txUrl = (h) => h ? `${explorer}/tx/${h}` : null;

  return (
    <motion.div
      className="settled-banner"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(16, 24, 32, 0.96)', color: '#d8f5d8',
        border: '1px solid rgba(80, 200, 120, 0.6)', borderRadius: 12,
        padding: '16px 24px', maxWidth: 640, width: 'calc(100% - 48px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)', zIndex: 60,
        fontSize: 13, lineHeight: 1.5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            ✓ Trade settled on {network?.name || 'chain'}
          </div>
          <div style={{ opacity: 0.85, marginBottom: 4 }}>
            {userAgent?.name} ↔ {counterparty?.name || 'counterparty'} @ {settlement.price ?? '—'}{' '}
            {userAgent?.buyToken?.symbol}/{userAgent?.sellToken?.symbol}
          </div>
          {settlement.orderId && (
            <div style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
              Order: {settlement.orderId.slice(0, 18)}…{settlement.orderId.slice(-6)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
            {settlement.txHash && (
              <a href={txUrl(settlement.txHash)} target="_blank" rel="noreferrer"
                 style={{ color: '#8ed8ff', textDecoration: 'underline' }}>
                Create TX ↗
              </a>
            )}
            {settlement.fulfillTxHash && (
              <a href={txUrl(settlement.fulfillTxHash)} target="_blank" rel="noreferrer"
                 style={{ color: '#8ed8ff', textDecoration: 'underline' }}>
                Fulfill TX ↗
              </a>
            )}
          </div>
        </div>
        <button
          onClick={onReset}
          style={{
            background: 'rgba(80, 200, 120, 0.15)', color: '#d8f5d8',
            border: '1px solid rgba(80, 200, 120, 0.5)', borderRadius: 6,
            padding: '8px 14px', cursor: 'pointer', fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          Deploy new agent
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Normalize a backend agent object for frontend display.
 * Compatibility: agents match when their token pair is the inverse of the user's
 * (A sells X for Y ↔ B sells Y for X) on the same chain, with overlapping price ranges.
 */
function normalizeAgent(agent, userAgent) {
  if (!agent) return agent;
  const strat = STRATEGIES[agent.strategy] || STRATEGIES.moderate;

  let isCompatible = false;
  if (userAgent) {
    // Cross-chain aware: match each leg on (address + chainId). A's sell must
    // equal B's buy on the same chain (and vice versa). Same-chain trades are
    // the special case where both legs share a chainId.
    const sameToken = (x, y) =>
      x && y &&
      (x.address || '').toLowerCase() === (y.address || '').toLowerCase() &&
      Number(x.chainId) === Number(y.chainId);
    const inversePair =
      sameToken(userAgent.sellToken, agent.buyToken) &&
      sameToken(userAgent.buyToken, agent.sellToken);
    if (inversePair) {
      // Price-range overlap (both converted to userAgent's unit: buyToken per sellToken)
      const uMin = userAgent.priceMin, uMax = userAgent.priceMax;
      const aMinInU = 1 / agent.priceMax;
      const aMaxInU = 1 / agent.priceMin;
      isCompatible = Math.max(uMin, aMinInU) <= Math.min(uMax, aMaxInU);
    }
  }

  return {
    ...agent,
    hue: hashToHue(agent.id || agent.name),
    owner: 'other',
    strategyConfig: strat,
    isBackend: true,
    isCompatible,
  };
}

function hashToHue(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
