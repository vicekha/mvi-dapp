/**
 * AutoSwap Agent Server
 * HTTP API + WebSocket for AI agent-to-agent negotiation marketplace.
 * Agents use Claude API for decision-making and Planbok MPC wallets for on-chain settlement.
 *
 * Start: node server.js
 * Env: ANTHROPIC_API_KEY, PLANBOK_API_KEY, PLANBOK_API_URL
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createAgent, runAgentRound, listAgents, getAgent, removeAgent, agents as agentStore } from './agent-engine.js';
import { healthCheck as planbokHealth } from './planbok-client.js';
import { settleNegotiation } from './settlement.js';

const app = express();
app.use(express.json());

// CORS for frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 4000;
const WS_PORT = process.env.WS_PORT || 4001;

// ---- Active Negotiations ----
const negotiations = new Map();
const wsClients = new Set();

// ---- HTTP API ----

app.get('/api/health', async (req, res) => {
  const planbok = await planbokHealth();
  res.json({
    status: 'ok',
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    planbok,
    agents: listAgents().length,
    negotiations: negotiations.size,
  });
});

/**
 * POST /api/agents — Create a new AI agent
 * Body: { name, strategy, sellToken, buyToken, sellAmount, priceMin, priceMax, maxRounds, ownerAddress, fundAmount? }
 *
 * fundAmount (optional): Amount of sellToken to transfer from the server wallet to the agent's
 * Planbok MPC wallet. For native ETH, includes a 0.005 ETH gas buffer automatically.
 * For ERC-20 tokens, also sends 0.005 ETH for gas.
 * If omitted, the wallet is created but not funded.
 */
app.post('/api/agents', async (req, res) => {
  try {
    const { name, strategy, sellToken, buyToken, sellAmount, priceMin, priceMax, maxRounds, ownerAddress, fundAmount } = req.body;
    const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const agent = await createAgent({
      id, name, strategy, sellToken, buyToken,
      sellAmount: parseFloat(sellAmount),
      priceMin: parseFloat(priceMin),
      priceMax: parseFloat(priceMax),
      maxRounds: maxRounds || 12,
      ownerAddress,
      fundAmount: fundAmount ? parseFloat(fundAmount) : null,
    });

    // Broadcast new agent to all WS clients
    broadcast({ type: 'agent_joined', agent: sanitizeAgent(agent) });

    res.json({ success: true, agent: sanitizeAgent(agent) });

    // Kick matchmaker right away so compatible pairs start negotiating immediately
    setImmediate(runMatchmakerOnce);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/agents — List all agents
 */
app.get('/api/agents', (req, res) => {
  res.json({ agents: listAgents() });
});

/**
 * DELETE /api/agents/:id — Remove an agent
 */
app.delete('/api/agents/:id', (req, res) => {
  removeAgent(req.params.id);
  broadcast({ type: 'agent_left', agentId: req.params.id });
  res.json({ success: true });
});

/**
 * POST /api/negotiate — Start a negotiation between two agents
 * Body: { agentA: id, agentB: id }
 */
app.post('/api/negotiate', async (req, res) => {
  try {
    const { agentA, agentB } = req.body;
    const a = getAgent(agentA);
    const b = getAgent(agentB);

    if (!a || !b) return res.status(404).json({ error: 'Agent not found' });

    const negId = `neg-${Date.now()}`;
    const fairRate = (a.sellToken.basePrice || 1) / (a.buyToken.basePrice || 1);

    const negotiation = {
      id: negId,
      agentA: agentA,
      agentB: agentB,
      round: 0,
      maxRounds: Math.min(a.maxRounds, b.maxRounds),
      history: [],
      status: 'active', // active | agreed | failed | settled
      agreedPrice: null,
      fairRate,
      startedAt: new Date(),
    };

    negotiations.set(negId, negotiation);

    broadcast({
      type: 'negotiation_started',
      negotiation: { id: negId, agentA: sanitizeAgent(a), agentB: sanitizeAgent(b), fairRate },
    });

    // Start negotiation loop in background
    runNegotiation(negId);

    res.json({ success: true, negotiationId: negId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/negotiations — List active negotiations
 */
app.get('/api/negotiations', (req, res) => {
  const negs = Array.from(negotiations.values()).map(n => ({
    id: n.id, agentA: n.agentA, agentB: n.agentB,
    round: n.round, status: n.status, agreedPrice: n.agreedPrice,
  }));
  res.json({ negotiations: negs });
});

/**
 * GET /api/negotiations/:id — Get negotiation details
 */
app.get('/api/negotiations/:id', (req, res) => {
  const neg = negotiations.get(req.params.id);
  if (!neg) return res.status(404).json({ error: 'Not found' });
  res.json(neg);
});

/**
 * POST /api/negotiations/:id/settle — Manually trigger settlement
 */
app.post('/api/negotiations/:id/settle', async (req, res) => {
  const neg = negotiations.get(req.params.id);
  if (!neg) return res.status(404).json({ error: 'Not found' });
  if (neg.status !== 'agreed') return res.status(400).json({ error: `Cannot settle: status is ${neg.status}` });

  try {
    const agentA = getAgent(neg.agentA);
    const agentB = getAgent(neg.agentB);
    if (!agentA || !agentB) return res.status(404).json({ error: 'Agent not found' });

    neg.status = 'settling';
    broadcast({ type: 'negotiation_settling', negotiationId: req.params.id });

    const result = await settleNegotiation(neg, agentA, agentB);
    neg.status = 'settled';
    neg.settlement = result;

    broadcast({
      type: 'negotiation_settled',
      negotiationId: req.params.id,
      txHash: result.txHash,
      fulfillTxHash: result.fulfillTxHash,
      orderId: result.orderId,
    });

    res.json({ success: true, settlement: result });
  } catch (err) {
    neg.status = 'agreed'; // revert so user can retry
    res.status(500).json({ error: err.message });
  }
});

// ---- Auto-Matchmaker ----
// Scans idle agents for compatible inverse token pairs with overlapping price ranges
// and starts negotiations automatically. No NPCs — only real backend agents.

function isCompatiblePair(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (a.sellToken.chainId !== b.sellToken.chainId) return false;
  const aSell = (a.sellToken.address || '').toLowerCase();
  const aBuy  = (a.buyToken.address  || '').toLowerCase();
  const bSell = (b.sellToken.address || '').toLowerCase();
  const bBuy  = (b.buyToken.address  || '').toLowerCase();
  if (aSell !== bBuy || aBuy !== bSell) return false;
  // Price overlap in A's unit (buyToken per sellToken)
  const aMin = a.priceMin, aMax = a.priceMax;
  const bMinInA = 1 / b.priceMax;
  const bMaxInA = 1 / b.priceMin;
  return Math.max(aMin, bMinInA) <= Math.min(aMax, bMaxInA);
}

function busyAgentIds() {
  const ids = new Set();
  for (const n of negotiations.values()) {
    // 'settled' is included so agents that completed a trade retire from
    // the matchmaker and don't get paired into a new negotiation on the
    // next tick (their inventory was a one-shot order).
    if (['active', 'agreed', 'settling', 'settled'].includes(n.status)) {
      ids.add(n.agentA); ids.add(n.agentB);
    }
  }
  return ids;
}

// Pairs that recently failed to negotiate — keyed by sorted "agentIdA|agentIdB"
// so the matchmaker doesn't immediately retry the same pair forever.
const failedPairs = new Map(); // key -> expiresAt
const FAILED_PAIR_COOLDOWN_MS = 5 * 60 * 1000;
function pairKey(a, b) { return [a, b].sort().join('|'); }
function isPairCoolingDown(aId, bId) {
  const k = pairKey(aId, bId);
  const until = failedPairs.get(k);
  if (!until) return false;
  if (Date.now() > until) { failedPairs.delete(k); return false; }
  return true;
}
function markPairFailed(aId, bId) {
  failedPairs.set(pairKey(aId, bId), Date.now() + FAILED_PAIR_COOLDOWN_MS);
}

function autoStartNegotiation(a, b) {
  const negId = `neg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const fairRate = (a.sellToken.basePrice || 1) / (a.buyToken.basePrice || 1);
  negotiations.set(negId, {
    id: negId, agentA: a.id, agentB: b.id,
    round: 0, maxRounds: Math.min(a.maxRounds, b.maxRounds),
    history: [], status: 'active', agreedPrice: null, fairRate,
    startedAt: new Date(),
  });
  console.log(`[Matchmaker] ${a.name} (${a.sellToken.symbol}→${a.buyToken.symbol}) ↔ ${b.name} — negotiation ${negId}`);
  broadcast({
    type: 'negotiation_started',
    negotiation: { id: negId, agentA: sanitizeAgent(a), agentB: sanitizeAgent(b), fairRate },
  });
  runNegotiation(negId);
}

function runMatchmakerOnce() {
  const all = Array.from(agentStore.values());
  const busy = busyAgentIds();
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (busy.has(a.id)) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      if (busy.has(b.id)) continue;
      if (isPairCoolingDown(a.id, b.id)) continue;
      if (!isCompatiblePair(a, b)) continue;
      autoStartNegotiation(a, b);
      busy.add(a.id); busy.add(b.id);
      break;
    }
  }
}

// Run every 4s so newly created agents are matched automatically.
setInterval(runMatchmakerOnce, 4000);

// ---- Negotiation Loop ----

/**
 * Run a single agent's turn, retrying if the agent uses info-only tools
 * (get_market_context, check_balance) instead of making a trade action.
 * Max 3 retries to avoid infinite loops.
 */
async function runAgentTurn(agentId, counterpartyOffer, round, counterpartyName) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await runAgentRound(agentId, counterpartyOffer, round, counterpartyName);
    // If the agent used an action tool, return it
    if (['make_offer', 'accept_offer', 'reject_and_withdraw'].includes(result.action)) {
      return result;
    }
    // Otherwise (get_market_context, check_balance, message), the agent needs another turn
    console.log(`[Neg] ${agentId} used ${result.action} on attempt ${attempt + 1}, prompting for trade action...`);
  }
  // If still no action after retries, force a withdrawal
  return { action: 'reject_and_withdraw', input: { reason: 'Agent failed to make a trade decision after multiple attempts' }, thinking: '' };
}

async function runNegotiation(negId) {
  const neg = negotiations.get(negId);
  if (!neg) return;

  const agentA = getAgent(neg.agentA);
  const agentB = getAgent(neg.agentB);
  if (!agentA || !agentB) {
    neg.status = 'failed';
    if (neg.agentA && neg.agentB) markPairFailed(neg.agentA, neg.agentB);
    broadcast({ type: 'negotiation_failed', negotiationId: negId, reason: 'Agent not found' });
    return;
  }

  const failAndCooldown = () => markPairFailed(neg.agentA, neg.agentB);

  // Both agents negotiate in the SAME price unit: Agent A's buyToken per Agent A's sellToken
  // e.g., if A sells WETH and buys USDC, price = USDC per WETH (like 3200)
  const priceUnit = `${agentA.buyToken.symbol} per ${agentA.sellToken.symbol}`;
  console.log(`[Neg ${negId}] Price unit: ${priceUnit} | Fair rate: ${neg.fairRate}`);

  let lastOfferA = null;
  let lastOfferB = null;

  for (let round = 0; round < neg.maxRounds; round++) {
    neg.round = round;

    // Agent A's turn (seller)
    try {
      const resultA = await runAgentTurn(
        neg.agentA,
        lastOfferB ? { price: lastOfferB.price, message: lastOfferB.message } : null,
        round,
        agentB.name,
      );

      const msgA = {
        round,
        sender: agentA.id,
        senderName: agentA.name,
        action: resultA.action,
        price: resultA.input?.price || 0,
        message: resultA.input?.message || resultA.input?.reason || '',
        thinking: resultA.thinking,
        timestamp: new Date(),
      };

      neg.history.push(msgA);
      broadcast({ type: 'negotiation_message', negotiationId: negId, message: msgA });

      if (resultA.action === 'accept_offer' && lastOfferB) {
        neg.status = 'agreed';
        neg.agreedPrice = lastOfferB.price;
        broadcast({ type: 'negotiation_agreed', negotiationId: negId, price: lastOfferB.price, acceptedBy: agentA.name });
        trySettle(negId);
        return;
      }

      if (resultA.action === 'reject_and_withdraw') {
        neg.status = 'failed';
        failAndCooldown();
        broadcast({ type: 'negotiation_failed', negotiationId: negId, reason: `${agentA.name} withdrew: ${resultA.input.reason}` });
        return;
      }

      if (resultA.action === 'make_offer') {
        lastOfferA = { price: resultA.input.price, message: resultA.input.message };
      }
    } catch (err) {
      console.error(`[Neg ${negId}] Agent A error:`, err.message);
      neg.status = 'failed';
      failAndCooldown();
      broadcast({ type: 'negotiation_failed', negotiationId: negId, reason: `${agentA.name} error: ${err.message}` });
      return;
    }

    await sleep(1500);

    // Agent B's turn (buyer) — receives offers in the SAME price unit
    try {
      const resultB = await runAgentTurn(
        neg.agentB,
        lastOfferA ? { price: lastOfferA.price, message: lastOfferA.message } : null,
        round,
        agentA.name,
      );

      const msgB = {
        round,
        sender: agentB.id,
        senderName: agentB.name,
        action: resultB.action,
        price: resultB.input?.price || 0,
        message: resultB.input?.message || resultB.input?.reason || '',
        thinking: resultB.thinking,
        timestamp: new Date(),
      };

      neg.history.push(msgB);
      broadcast({ type: 'negotiation_message', negotiationId: negId, message: msgB });

      if (resultB.action === 'accept_offer' && lastOfferA) {
        neg.status = 'agreed';
        neg.agreedPrice = lastOfferA.price;
        broadcast({ type: 'negotiation_agreed', negotiationId: negId, price: lastOfferA.price, acceptedBy: agentB.name });
        trySettle(negId);
        return;
      }

      if (resultB.action === 'reject_and_withdraw') {
        neg.status = 'failed';
        failAndCooldown();
        broadcast({ type: 'negotiation_failed', negotiationId: negId, reason: `${agentB.name} withdrew: ${resultB.input.reason}` });
        return;
      }

      if (resultB.action === 'make_offer') {
        lastOfferB = { price: resultB.input.price, message: resultB.input.message };
      }
    } catch (err) {
      console.error(`[Neg ${negId}] Agent B error:`, err.message);
      neg.status = 'failed';
      failAndCooldown();
      broadcast({ type: 'negotiation_failed', negotiationId: negId, reason: `${agentB.name} error: ${err.message}` });
      return;
    }

    // Check for convergence — if offers are within 2%, auto-agree at midpoint
    if (lastOfferA && lastOfferB) {
      const spread = Math.abs(lastOfferA.price - lastOfferB.price) / neg.fairRate;
      if (spread < 0.02) {
        const midPrice = parseFloat(((lastOfferA.price + lastOfferB.price) / 2).toFixed(6));
        neg.status = 'agreed';
        neg.agreedPrice = midPrice;

        const convMsg = {
          round, sender: 'system', senderName: 'System', action: 'converged',
          price: midPrice, message: `Agents converged! Meeting at midpoint: ${midPrice} ${priceUnit}`,
          timestamp: new Date(),
        };
        neg.history.push(convMsg);

        broadcast({ type: 'negotiation_agreed', negotiationId: negId, price: midPrice, acceptedBy: 'system (convergence)' });
        trySettle(negId);
        return;
      }
    }

    await sleep(1500);
  }

  neg.status = 'failed';
  failAndCooldown();
  broadcast({ type: 'negotiation_failed', negotiationId: negId, reason: 'Max rounds reached — no agreement' });
}

/**
 * Attempt on-chain settlement after agents agree.
 * Runs asynchronously — doesn't block the negotiation response.
 */
async function trySettle(negId) {
  const neg = negotiations.get(negId);
  if (!neg || neg.status !== 'agreed') return;

  const agentA = getAgent(neg.agentA);
  const agentB = getAgent(neg.agentB);
  if (!agentA || !agentB) return;

  // Only settle if server has a private key configured
  if (!process.env.AUTOSWAP_PRIVATE_KEY && agentA.wallet.walletId?.startsWith('mock-')) {
    console.log(`[Settlement] Skipping on-chain settlement — no wallet configured. Agreed price: ${neg.agreedPrice}`);
    broadcast({
      type: 'settlement_pending',
      negotiationId: negId,
      price: neg.agreedPrice,
      message: 'Agents agreed. On-chain settlement requires Planbok wallet or server key.',
    });
    return;
  }

  try {
    neg.status = 'settling';
    broadcast({ type: 'settlement_started', negotiationId: negId });

    const result = await settleNegotiation(neg, agentA, agentB);

    neg.status = 'settled';
    neg.settlement = result;

    broadcast({
      type: 'negotiation_settled',
      negotiationId: negId,
      txHash: result.txHash,
      fulfillTxHash: result.fulfillTxHash,
      orderId: result.orderId,
      chainId: result.chainId,
    });

    console.log(`[Settlement] Negotiation ${negId} settled! TX: ${result.txHash}`);
  } catch (err) {
    console.error(`[Settlement] Failed for ${negId}:`, err.message);
    broadcast({
      type: 'settlement_failed',
      negotiationId: negId,
      error: err.message,
    });
  }
}

// ---- WebSocket Server ----

const httpServer = createServer(app);
// Attach WS to the same HTTP server so a single port works in Railway/Fly/Render.
// Local dev can still override via WS_PORT to use a separate listener.
const wss = process.env.WS_PORT && process.env.WS_PORT !== String(PORT)
  ? new WebSocketServer({ port: WS_PORT })
  : new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected (${wsClients.size} total)`);

  // Send current state on connect
  ws.send(JSON.stringify({
    type: 'state_sync',
    agents: listAgents(),
    negotiations: Array.from(negotiations.values()).map(n => ({
      id: n.id, agentA: n.agentA, agentB: n.agentB,
      round: n.round, status: n.status, history: n.history,
    })),
  }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'create_agent': {
          const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const agent = await createAgent({ id, ...msg.payload });
          broadcast({ type: 'agent_joined', agent: sanitizeAgent(agent) });
          ws.send(JSON.stringify({ type: 'agent_created', agent: sanitizeAgent(agent) }));
          break;
        }

        case 'start_negotiation': {
          const negId = `neg-${Date.now()}`;
          const a = getAgent(msg.agentA);
          const b = getAgent(msg.agentB);
          if (!a || !b) {
            ws.send(JSON.stringify({ type: 'error', message: 'Agent not found' }));
            break;
          }
          const fairRate = (a.sellToken.basePrice || 1) / (a.buyToken.basePrice || 1);
          negotiations.set(negId, {
            id: negId, agentA: msg.agentA, agentB: msg.agentB,
            round: 0, maxRounds: Math.min(a.maxRounds, b.maxRounds),
            history: [], status: 'active', agreedPrice: null, fairRate, startedAt: new Date(),
          });
          broadcast({ type: 'negotiation_started', negotiation: { id: negId, agentA: sanitizeAgent(a), agentB: sanitizeAgent(b), fairRate } });
          runNegotiation(negId);
          break;
        }

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (err) {
      console.error('[WS] Message error:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: err.message }));
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (${wsClients.size} total)`);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function sanitizeAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    strategy: agent.strategy,
    sellToken: agent.sellToken,
    buyToken: agent.buyToken,
    sellAmount: agent.sellAmount,
    priceMin: agent.priceMin,
    priceMax: agent.priceMax,
    status: agent.status,
    walletAddress: agent.wallet?.address,
    walletId: agent.wallet?.walletId,
    fundingTx: agent.fundingTx,
    maxRounds: agent.maxRounds,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- Start ----

httpServer.listen(PORT, () => {
  console.log(`\n🤖 AutoSwap Agent Server`);
  console.log(`   HTTP API: http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`   Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓ configured' : '✗ missing ANTHROPIC_API_KEY'}`);
  console.log(`   Planbok:   ${process.env.PLANBOK_API_KEY ? '✓ configured' : '✗ missing PLANBOK_API_KEY'}`);
  console.log('');
});
