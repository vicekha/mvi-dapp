import React, { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';
import { useWeb3ModalAccount } from '@web3modal/ethers/react';
import { NETWORKS } from '../config/networks.jsx';
import {
  checkAgentServer, connectAgentWS,
  createBackendAgent, listBackendAgents, startNegotiation, getNegotiation,
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
      // Generate NPC counterparties based on the user's agent config
      const userAgentLocal = createUserAgent({
        sellToken: action.agent.sellToken,
        buyToken: action.agent.buyToken,
        sellAmount: action.agent.sellAmount,
        priceMin: action.agent.priceMin,
        priceMax: action.agent.priceMax,
        strategy: action.agent.strategy,
        maxRounds: action.agent.maxRounds,
      });
      const npcs = generateNPCAgents(userAgentLocal, action.chainId, action.targetChainId);
      return {
        ...state,
        phase: 'marketplace',
        userAgent: action.agent,
        npcAgents: npcs,
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
        showSettlement: false,
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

  const activeNetwork = NETWORKS.find(n => BigInt(n.id) === BigInt(chainId || 146)) || NETWORKS[0];
  const [targetNetwork, setTargetNetwork] = useState(activeNetwork);

  // Check agent server + connect WebSocket
  useEffect(() => {
    checkAgentServer().then(setServerOnline);

    const conn = connectAgentWS(
      (data) => {
        switch (data.type) {
          case 'agent_joined':
            dispatch({ type: 'ADD_NPC_AGENT', agent: normalizeAgent(data.agent) });
            break;
          case 'negotiation_message':
            dispatch({ type: 'NEGOTIATION_MESSAGE', message: data.message });
            break;
          case 'negotiation_agreed':
            dispatch({ type: 'NEGOTIATION_AGREED', price: data.price });
            break;
          case 'negotiation_failed':
            dispatch({ type: 'NEGOTIATION_FAILED', reason: data.reason });
            break;
          case 'negotiation_settled':
            dispatch({ type: 'SETTLEMENT_SUCCESS', txHash: data.txHash, fulfillTxHash: data.fulfillTxHash });
            break;
        }
      },
      () => setServerOnline(true),
      () => setServerOnline(false),
    );
    wsRef.current = conn;

    return () => conn?.close();
  }, []);

  // Load existing agents from backend when entering marketplace
  useEffect(() => {
    if (state.phase !== 'marketplace' || !state.userAgent) return;

    listBackendAgents().then(data => {
      const others = (data.agents || [])
        .filter(a => a.id !== state.userAgent.id)
        .map(normalizeAgent);
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
    </div>
  );
}

/**
 * Normalize a backend agent object for frontend display.
 */
function normalizeAgent(agent) {
  if (!agent) return agent;
  const strat = STRATEGIES[agent.strategy] || STRATEGIES.moderate;

  // Determine compatibility — agents are compatible if they want opposite token pairs
  return {
    ...agent,
    hue: hashToHue(agent.id || agent.name),
    owner: 'npc',
    strategyConfig: strat,
    isBackend: true,
    isCompatible: true, // backend agents are created as counterparties
  };
}

function hashToHue(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
