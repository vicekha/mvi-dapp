/**
 * Agent Personalities & NPC Generator
 * Defines strategy presets and generates simulated counterparty agents
 * that negotiate against the user's agent in the marketplace.
 */

import TOKEN_LIST from '../tokenlist.json';
import { NETWORKS } from '../config/networks.jsx';

// Strategy presets that control negotiation behavior
export const STRATEGIES = {
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Pushes for the best price. Slow to concede, walks away easily.',
    concessionRate: 0.025,
    patience: 8,
    startBias: 0.15, // starts 15% away from fair price in own favor
    acceptThreshold: 0.03, // accepts if within 3% of target
    color: '#ef4444',
    icon: 'flame',
  },
  moderate: {
    id: 'moderate',
    name: 'Moderate',
    description: 'Balanced approach. Fair concessions, reasonable patience.',
    concessionRate: 0.06,
    patience: 12,
    startBias: 0.08,
    acceptThreshold: 0.06,
    color: '#f59e0b',
    icon: 'scale',
  },
  passive: {
    id: 'passive',
    name: 'Passive',
    description: 'Prioritizes deal completion. Quick to agree, flexible on price.',
    concessionRate: 0.11,
    patience: 6,
    startBias: 0.03,
    acceptThreshold: 0.10,
    color: '#10b981',
    icon: 'leaf',
  },
};

// NPC names and avatar hues
const NPC_PROFILES = [
  { name: 'AlphaBot', hue: 260, strategy: 'aggressive' },
  { name: 'YieldHunter', hue: 35, strategy: 'aggressive' },
  { name: 'DCA-3000', hue: 190, strategy: 'moderate' },
  { name: 'SwapSage', hue: 140, strategy: 'moderate' },
  { name: 'LiquidityOwl', hue: 280, strategy: 'moderate' },
  { name: 'PatienceBot', hue: 160, strategy: 'passive' },
  { name: 'FairDeal.ai', hue: 50, strategy: 'passive' },
  { name: 'NexusTrader', hue: 320, strategy: 'aggressive' },
  { name: 'ChainWalker', hue: 200, strategy: 'moderate' },
  { name: 'QuietAccum', hue: 100, strategy: 'passive' },
  { name: 'VelocityX', hue: 10, strategy: 'aggressive' },
  { name: 'MidCurve', hue: 220, strategy: 'moderate' },
];

// Simple deterministic hash for seeding
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Deterministic pseudo-random from seed
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

/**
 * Generate NPC agents that are compatible counterparties for the user's agent.
 * If userAgent sells token A and wants token B, NPCs sell token B and want token A.
 * Also generates NPCs with different token pairs for marketplace variety.
 */
export function generateNPCAgents(userAgent, chainId, targetChainId) {
  const seed = hashSeed(`${chainId}-${targetChainId}-${userAgent?.sellToken?.symbol || 'X'}-${Date.now().toString().slice(0, -4)}`);
  const rng = seededRandom(seed);

  const chainTokens = TOKEN_LIST.tokens.filter(t => t.chainId === chainId || t.chainId === targetChainId);
  const agents = [];

  NPC_PROFILES.forEach((profile, idx) => {
    const r = rng();
    const strategy = STRATEGIES[profile.strategy];

    // 60% chance to be a direct counterparty (inverse of user's trade)
    const isDirect = userAgent && r < 0.6 && userAgent.sellToken && userAgent.buyToken;

    let sellToken, buyToken, sellAmount, priceMin, priceMax;

    if (isDirect) {
      sellToken = userAgent.buyToken;
      buyToken = userAgent.sellToken;
      const baseRate = (buyToken.basePrice || 1) / (sellToken.basePrice || 1);
      const spread = strategy.startBias + rng() * 0.1;
      sellAmount = parseFloat(userAgent.sellAmount || 100) * baseRate * (0.5 + rng());
      priceMin = baseRate * (1 - spread - 0.05);
      priceMax = baseRate * (1 + spread + 0.05);
    } else {
      // Random pair from available tokens
      const available = chainTokens.filter(t => t.basePrice > 0);
      if (available.length < 2) return;
      const si = Math.floor(rng() * available.length);
      let bi = Math.floor(rng() * (available.length - 1));
      if (bi >= si) bi++;
      sellToken = available[si];
      buyToken = available[bi];
      const baseRate = (buyToken.basePrice || 1) / (sellToken.basePrice || 1);
      const spread = strategy.startBias + rng() * 0.15;
      sellAmount = (10 + rng() * 990).toFixed(2);
      priceMin = baseRate * (1 - spread - 0.05);
      priceMax = baseRate * (1 + spread + 0.05);
    }

    agents.push({
      id: `npc-${idx}-${hashSeed(profile.name + seed)}`,
      name: profile.name,
      hue: profile.hue,
      owner: 'npc',
      strategy: profile.strategy,
      strategyConfig: strategy,
      sellToken,
      buyToken,
      sellAmount: parseFloat(parseFloat(sellAmount).toFixed(6)),
      priceMin: parseFloat(priceMin.toFixed(8)),
      priceMax: parseFloat(priceMax.toFixed(8)),
      maxRounds: strategy.patience + Math.floor(rng() * 4),
      isDirect,
      isCompatible: isDirect,
    });
  });

  // Sort: compatible counterparties first
  agents.sort((a, b) => (b.isCompatible ? 1 : 0) - (a.isCompatible ? 1 : 0));

  return agents;
}

/**
 * Create a user agent configuration object
 */
export function createUserAgent({ sellToken, buyToken, sellAmount, priceMin, priceMax, strategy, maxRounds }) {
  const strat = STRATEGIES[strategy] || STRATEGIES.moderate;
  return {
    id: `user-${Date.now()}`,
    name: 'Your Agent',
    owner: 'user',
    strategy,
    strategyConfig: strat,
    sellToken,
    buyToken,
    sellAmount: parseFloat(sellAmount),
    priceMin: parseFloat(priceMin),
    priceMax: parseFloat(priceMax),
    maxRounds: maxRounds || strat.patience,
    isCompatible: true,
  };
}
