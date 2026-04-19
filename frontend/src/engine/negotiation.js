/**
 * Negotiation Engine
 * Handles agent-to-agent price negotiation using a bilateral auction model.
 * Integrates with Planbok for wallet infrastructure, falls back to basePrice for rates.
 */

import { getBestRate, computeBaseRate } from '../config/planbok.js';

/**
 * Negotiation states
 */
export const NEG_STATUS = {
  IDLE: 'idle',
  MATCHING: 'matching',
  NEGOTIATING: 'negotiating',
  AGREED: 'agreed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  SETTLING: 'settling',
  SETTLED: 'settled',
};

/**
 * Message types in the negotiation log
 */
export const MSG_TYPE = {
  SYSTEM: 'system',
  OFFER: 'offer',
  COUNTER: 'counter',
  ACCEPT: 'accept',
  REJECT: 'reject',
  WITHDRAW: 'withdraw',
  INFO: 'info',
};

/**
 * Generate a deterministic noise value for an agent at a given round.
 * Creates natural-feeling price variation without true randomness.
 */
function agentNoise(agentId, round) {
  let h = 0;
  const str = `${agentId}-${round}`;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 10000 - 0.05; // range: -0.05 to +0.05
}

/**
 * Calculate an agent's offer for a given round.
 * The agent starts biased toward its own favorable price and concedes toward
 * a fair midpoint over successive rounds.
 *
 * @param {Object} agent - Agent config with strategyConfig, priceMin, priceMax
 * @param {number} round - Current round (0-indexed)
 * @param {number} fairRate - Fair market rate (from TWAK or basePrice)
 * @param {string} side - 'buyer' or 'seller' determines direction of bias
 * @param {Array} history - Previous messages in this negotiation
 * @returns {number} The price the agent offers
 */
export function generateOffer(agent, round, fairRate, side, history) {
  const { concessionRate, startBias } = agent.strategyConfig;

  // Seller wants high price (more buyToken per sellToken)
  // Buyer wants low price (less buyToken per sellToken)
  const startPrice = side === 'seller'
    ? fairRate * (1 + startBias)
    : fairRate * (1 - startBias);

  const targetPrice = fairRate;

  // Concession: move toward fair price each round
  const concession = Math.min(1, concessionRate * round);
  let offer = startPrice + concession * (targetPrice - startPrice);

  // Add slight noise for realism
  const noise = agentNoise(agent.id, round);
  offer *= (1 + noise * 0.02);

  // If counterparty made a better offer than our current, anchor to it
  if (history.length > 0) {
    const lastCounterOffer = [...history]
      .reverse()
      .find(m => m.sender !== agent.id && (m.type === MSG_TYPE.OFFER || m.type === MSG_TYPE.COUNTER));

    if (lastCounterOffer) {
      const counterPrice = lastCounterOffer.price;
      // If their offer is already better than what we'd propose, meet them halfway
      if (side === 'seller' && counterPrice > offer) {
        offer = (offer + counterPrice) / 2;
      } else if (side === 'buyer' && counterPrice < offer) {
        offer = (offer + counterPrice) / 2;
      }
    }
  }

  return parseFloat(offer.toFixed(8));
}

/**
 * Evaluate whether an agent should accept an incoming offer.
 */
export function evaluateOffer(agent, incomingPrice, fairRate, side) {
  const { acceptThreshold } = agent.strategyConfig;

  // How far is the offer from fair rate?
  const deviation = Math.abs(incomingPrice - fairRate) / fairRate;

  // Is the offer favorable to this agent?
  const isFavorable = side === 'seller'
    ? incomingPrice >= fairRate * (1 - acceptThreshold)
    : incomingPrice <= fairRate * (1 + acceptThreshold);

  // Also check if it's within the agent's acceptable range
  const inRange = incomingPrice >= agent.priceMin && incomingPrice <= agent.priceMax;

  return {
    accept: isFavorable && inRange,
    deviation,
    inRange,
    isFavorable,
  };
}

/**
 * Generate a human-readable negotiation message.
 */
function makeMessage(sender, senderName, type, price, amount, extra = '') {
  const templates = {
    [MSG_TYPE.OFFER]: [
      `I'll offer ${price} per token for this trade.`,
      `My opening price: ${price}. Let's discuss.`,
      `Starting at ${price} — open to negotiation.`,
    ],
    [MSG_TYPE.COUNTER]: [
      `I can do ${price}. That's my counter.`,
      `How about ${price} instead?`,
      `Counter-proposal: ${price} per token.`,
      `Let me come back at ${price}.`,
    ],
    [MSG_TYPE.ACCEPT]: [
      `Deal! ${price} works for me. Let's settle.`,
      `Agreed at ${price}. Initiating settlement.`,
      `I accept ${price}. Good trade.`,
    ],
    [MSG_TYPE.REJECT]: [
      `${price} is too far off. I'm walking away.`,
      `Can't make this work. Max rounds reached.`,
      `No deal — our prices are too far apart.`,
    ],
  };

  const msgs = templates[type] || [`${type} at ${price}`];
  // Deterministic selection based on sender hash
  let h = 0;
  for (let i = 0; i < sender.length; i++) h = ((h << 5) - h + sender.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % msgs.length;

  return {
    id: `msg-${Date.now()}-${Math.abs(h) % 9999}`,
    sender,
    senderName,
    type,
    price,
    amount,
    message: extra || msgs[idx],
    timestamp: new Date(),
  };
}

/**
 * Run a single round of negotiation between two agents.
 *
 * @param {Object} agentA - The initiator (user's agent, acts as "seller")
 * @param {Object} agentB - The counterparty (NPC, acts as "buyer")
 * @param {number} round - Current round number
 * @param {Array} history - All previous messages
 * @param {number} fairRate - Fair market rate
 * @returns {{ messages: Array, agreed: boolean, agreedPrice: number|null }}
 */
export function runNegotiationRound(agentA, agentB, round, history, fairRate) {
  const messages = [];

  // Agent A makes an offer (seller side — wants higher price)
  const offerA = generateOffer(agentA, round, fairRate, 'seller', history);
  messages.push(makeMessage(
    agentA.id, agentA.name,
    round === 0 ? MSG_TYPE.OFFER : MSG_TYPE.COUNTER,
    offerA, agentA.sellAmount,
  ));

  // Agent B evaluates
  const evalB = evaluateOffer(agentB, offerA, fairRate, 'buyer');

  if (evalB.accept) {
    messages.push(makeMessage(agentB.id, agentB.name, MSG_TYPE.ACCEPT, offerA, null));
    return { messages, agreed: true, agreedPrice: offerA };
  }

  // Agent B counters (buyer side — wants lower price)
  const allHistory = [...history, ...messages];
  const offerB = generateOffer(agentB, round, fairRate, 'buyer', allHistory);
  messages.push(makeMessage(agentB.id, agentB.name, MSG_TYPE.COUNTER, offerB, null));

  // Agent A evaluates B's counter
  const evalA = evaluateOffer(agentA, offerB, fairRate, 'seller');

  if (evalA.accept) {
    messages.push(makeMessage(agentA.id, agentA.name, MSG_TYPE.ACCEPT, offerB, null));
    return { messages, agreed: true, agreedPrice: offerB };
  }

  // Check if prices are close enough for auto-agreement (within 1%)
  const spread = Math.abs(offerA - offerB) / fairRate;
  if (spread < 0.01) {
    const midPrice = parseFloat(((offerA + offerB) / 2).toFixed(8));
    messages.push(makeMessage(
      'system', 'System', MSG_TYPE.ACCEPT, midPrice, null,
      `Agents converged! Meeting at midpoint: ${midPrice}`
    ));
    return { messages, agreed: true, agreedPrice: midPrice };
  }

  return { messages, agreed: false, agreedPrice: null };
}

/**
 * Calculate settlement amounts from agreed price.
 * Returns exact values for createOrder contract call.
 */
export function calculateSettlement(sellToken, buyToken, agreedPrice, sellAmount) {
  const sellDecimals = sellToken.decimals || 18;
  const buyDecimals = buyToken.decimals || 18;

  const buyAmount = sellAmount * agreedPrice;

  return {
    sellAmount: sellAmount.toFixed(sellDecimals > 6 ? 8 : 6),
    buyAmount: buyAmount.toFixed(buyDecimals > 6 ? 8 : 6),
    sellAmountRaw: sellAmount,
    buyAmountRaw: buyAmount,
    rate: agreedPrice,
    sellToken,
    buyToken,
  };
}

/**
 * Get fair market rate, attempting TWAK first.
 */
export async function getFairRate(sellToken, buyToken, chainId) {
  try {
    const result = await getBestRate(sellToken, buyToken, chainId);
    return { rate: result.rate, source: result.source };
  } catch {
    return { rate: computeBaseRate(sellToken, buyToken), source: 'fallback' };
  }
}
