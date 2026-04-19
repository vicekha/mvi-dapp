/**
 * AI Agent Engine
 * Each agent is a Claude conversation with tool use.
 * Agents use Planbok wallets to check balances and settle trades.
 * The engine manages agent lifecycle, negotiation rounds, and settlement.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createAgentWallet, getBalances } from './planbok-client.js';

let _anthropic = null;
function getClient() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// Active agents in the marketplace
const agents = new Map();

// Tools available to each AI agent
const AGENT_TOOLS = [
  {
    name: 'check_balance',
    description: 'Check the agent wallet balance on a specific chain',
    input_schema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Chain name: sepolia, base-sepolia, sonic-testnet, reactive' },
      },
      required: ['chain'],
    },
  },
  {
    name: 'make_offer',
    description: 'Send a price offer to the counterparty agent. Price is expressed as how much buyToken per 1 sellToken.',
    input_schema: {
      type: 'object',
      properties: {
        price: { type: 'number', description: 'Offered price ratio (buyToken per sellToken)' },
        message: { type: 'string', description: 'A short negotiation message explaining your reasoning' },
      },
      required: ['price', 'message'],
    },
  },
  {
    name: 'accept_offer',
    description: 'Accept the counterparty last offer and proceed to settlement',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Acceptance message' },
      },
      required: ['message'],
    },
  },
  {
    name: 'reject_and_withdraw',
    description: 'Reject all offers and withdraw from negotiation',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you are withdrawing' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'get_market_context',
    description: 'Get current market data: fair rate, token prices, recent trades',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Create a new AI trading agent
 */
export async function createAgent({ id, name, strategy, sellToken, buyToken, sellAmount, priceMin, priceMax, maxRounds, ownerAddress, fundAmount }) {
  const chainId = sellToken.chainId || 11155111;

  // Create Planbok MPC wallet for this agent
  let wallet;
  try {
    wallet = await createAgentWallet(id, [chainId]);
  } catch (err) {
    console.error(`[Agent ${id}] Failed to create Planbok wallet:`, err.message);
    wallet = { walletId: `mock-${id}`, address: '0x0000000000000000000000000000000000000000' };
  }

  // Fund the agent wallet from the server wallet if fundAmount specified
  let fundingTx = null;
  if (fundAmount && wallet.address !== '0x0000000000000000000000000000000000000000') {
    try {
      fundingTx = await fundAgentWallet(wallet.address, fundAmount, sellToken, chainId);
      console.log(`[Agent ${id}] Funded wallet with ${fundAmount} ${sellToken.symbol} — tx: ${fundingTx.hash}`);
    } catch (err) {
      console.error(`[Agent ${id}] Funding failed:`, err.message);
    }
  }

  const agent = {
    id,
    name,
    strategy,
    sellToken,
    buyToken,
    sellAmount,
    priceMin,
    priceMax,
    maxRounds: maxRounds || 12,
    ownerAddress,
    wallet,
    fundingTx: fundingTx?.hash || null,
    conversationHistory: [],
    status: 'idle', // idle | funding | negotiating | agreed | settling | settled | withdrawn
    createdAt: new Date(),
  };

  const systemPrompt = buildSystemPrompt(agent);
  agent.systemPrompt = systemPrompt;

  agents.set(id, agent);
  console.log(`[Agent ${id}] Created: ${name} (${strategy}) — sells ${sellAmount} ${sellToken.symbol} for ${buyToken.symbol}`);
  console.log(`[Agent ${id}] Planbok wallet: ${wallet.address}`);

  return agent;
}

/**
 * Fund an agent's Planbok MPC wallet from the server wallet.
 * Transfers the sell token (native ETH or ERC-20) so the agent can settle trades.
 */
async function fundAgentWallet(agentAddress, fundAmount, sellToken, chainId) {
  const { ethers } = await import('ethers');

  const RPC_URLS = {
    11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
    84532: 'https://sepolia.base.org',
  };

  const pk = process.env.AUTOSWAP_PRIVATE_KEY;
  if (!pk) throw new Error('AUTOSWAP_PRIVATE_KEY not set — cannot fund agent wallet');

  const provider = new ethers.JsonRpcProvider(RPC_URLS[chainId]);
  const serverWallet = new ethers.Wallet(pk, provider);

  const isNative = !sellToken.address
    || sellToken.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
    || sellToken.address === ethers.ZeroAddress;

  if (isNative) {
    // Transfer native ETH + gas buffer (0.01 ETH covers contract gas deposit + tx gas)
    const amount = ethers.parseUnits(fundAmount.toString(), 18);
    const gasBuffer = ethers.parseEther('0.01');
    const total = amount + gasBuffer;

    console.log(`[Fund] Sending ${ethers.formatEther(total)} ETH to ${agentAddress} (${fundAmount} + 0.005 gas buffer)`);
    const tx = await serverWallet.sendTransaction({ to: agentAddress, value: total });
    await tx.wait();
    return tx;
  } else {
    // Transfer ERC-20 token + a small ETH amount for gas
    const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];
    const tokenContract = new ethers.Contract(sellToken.address, ERC20_ABI, serverWallet);
    const decimals = sellToken.decimals || 18;
    const amount = ethers.parseUnits(fundAmount.toString(), decimals);

    // Send gas ETH first
    const gasEth = ethers.parseEther('0.005');
    console.log(`[Fund] Sending 0.005 ETH for gas to ${agentAddress}`);
    const gasTx = await serverWallet.sendTransaction({ to: agentAddress, value: gasEth });
    await gasTx.wait();

    // Then transfer the ERC-20
    console.log(`[Fund] Transferring ${fundAmount} ${sellToken.symbol} to ${agentAddress}`);
    const tokenTx = await tokenContract.transfer(agentAddress, amount);
    await tokenTx.wait();
    return tokenTx;
  }
}

/**
 * Build the system prompt for an AI agent based on its strategy
 */
function buildSystemPrompt(agent) {
  const strategyInstructions = {
    aggressive: `You are an AGGRESSIVE trader. You push hard for the best price. Start with extreme offers in your favor. Concede slowly — only 1-3% per round. You'd rather walk away than accept a bad deal. Never accept an offer more than 5% worse than your target.`,
    moderate: `You are a MODERATE trader. You seek fair deals. Start near the midpoint and make reasonable concessions of 3-6% per round. You balance getting a good price with completing the trade. Accept offers within 8% of fair value.`,
    passive: `You are a PASSIVE trader. You prioritize completing the deal. Start close to the counterparty's likely position. Make generous concessions of 5-10% per round. You strongly prefer a completed trade over the best possible price.`,
  };

  const fairRate = (agent.sellToken.basePrice || 1) / (agent.buyToken.basePrice || 1);

  return `You are ${agent.name}, an autonomous AI trading agent on the AutoSwap decentralized exchange.

## Your Trade
- SELLING: ${agent.sellAmount} ${agent.sellToken.symbol} (${agent.sellToken.name})
- BUYING: ${agent.buyToken.symbol} (${agent.buyToken.name})
- Your acceptable price range: ${agent.priceMin} to ${agent.priceMax} ${agent.buyToken.symbol} per ${agent.sellToken.symbol}
- Fair market rate: approximately ${fairRate.toFixed(6)} ${agent.buyToken.symbol} per ${agent.sellToken.symbol}
- Maximum rounds: ${agent.maxRounds}

## Your Strategy
${strategyInstructions[agent.strategy] || strategyInstructions.moderate}

## Your Wallet
- Managed by Planbok MPC infrastructure (2-of-2 threshold)
- Wallet ID: ${agent.wallet.walletId}
- Address: ${agent.wallet.address}

## CRITICAL Rules
1. You MUST call make_offer on your FIRST turn. Do NOT call get_market_context or check_balance first. Start negotiating immediately.
2. Each turn, use exactly ONE of: make_offer, accept_offer, or reject_and_withdraw
3. Your price in make_offer = how much ${agent.buyToken.symbol} per 1 ${agent.sellToken.symbol}. Example: if fair rate is ${fairRate.toFixed(2)}, offer a number near that.
4. Your offers must be between ${agent.priceMin} and ${agent.priceMax}
5. Consider the counterparty's previous offers when deciding your next price
6. Settlement happens automatically when both agents agree
7. Keep messages under 30 words. This is agent-to-agent, not human conversation.
8. As a seller, higher price = better for you. As a buyer, lower price = better for you.`;
}

/**
 * Run one negotiation round — ask the AI agent to respond to the current state
 */
export async function runAgentRound(agentId, counterpartyOffer, roundNum, counterpartyName) {
  const agent = agents.get(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Build the user message for this round
  let userMessage;
  if (roundNum === 0 && !counterpartyOffer) {
    userMessage = `Negotiation started with ${counterpartyName}. You go first. Make your opening offer using the make_offer tool.`;
  } else if (counterpartyOffer) {
    userMessage = `Round ${roundNum + 1}/${agent.maxRounds}. ${counterpartyName} offers: ${counterpartyOffer.price} ${agent.buyToken.symbol} per ${agent.sellToken.symbol}. Their message: "${counterpartyOffer.message}". Respond with make_offer, accept_offer, or reject_and_withdraw.`;
  } else {
    userMessage = `Round ${roundNum + 1}/${agent.maxRounds}. Make your next move.`;
  }

  agent.conversationHistory.push({ role: 'user', content: userMessage });

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: agent.systemPrompt,
      tools: AGENT_TOOLS,
      messages: agent.conversationHistory,
    });

    // Extract tool use from response
    const toolUse = response.content.find(c => c.type === 'tool_use');
    const textBlock = response.content.find(c => c.type === 'text');

    agent.conversationHistory.push({ role: 'assistant', content: response.content });

    if (toolUse) {
      // Provide tool result back to conversation
      let toolResult;

      switch (toolUse.name) {
        case 'make_offer':
          toolResult = { status: 'offer_sent', price: toolUse.input.price };
          break;
        case 'accept_offer':
          agent.status = 'agreed';
          toolResult = { status: 'accepted', agreedPrice: counterpartyOffer?.price };
          break;
        case 'reject_and_withdraw':
          agent.status = 'withdrawn';
          toolResult = { status: 'withdrawn' };
          break;
        case 'check_balance':
          try {
            const balances = await getBalances(agent.wallet.walletId);
            toolResult = { balances };
          } catch {
            toolResult = { balances: 'unavailable', note: 'Using simulated balance' };
          }
          break;
        case 'get_market_context': {
          const fairRate = (agent.sellToken.basePrice || 1) / (agent.buyToken.basePrice || 1);
          toolResult = {
            fairRate,
            sellTokenPrice: agent.sellToken.basePrice,
            buyTokenPrice: agent.buyToken.basePrice,
          };
          break;
        }
        default:
          toolResult = { error: 'Unknown tool' };
      }

      agent.conversationHistory.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }],
      });

      return {
        agentId: agent.id,
        agentName: agent.name,
        action: toolUse.name,
        input: toolUse.input,
        thinking: textBlock?.text || '',
        round: roundNum,
      };
    }

    // No tool use — agent just sent text
    return {
      agentId: agent.id,
      agentName: agent.name,
      action: 'message',
      input: { message: textBlock?.text || '' },
      round: roundNum,
    };
  } catch (err) {
    console.error(`[Agent ${agentId}] Claude API error:`, err.message);
    throw err;
  }
}

/**
 * Get an agent's state
 */
export function getAgent(agentId) {
  return agents.get(agentId);
}

/**
 * List all agents
 */
export function listAgents() {
  return Array.from(agents.values()).map(a => ({
    id: a.id,
    name: a.name,
    strategy: a.strategy,
    sellToken: a.sellToken,
    buyToken: a.buyToken,
    sellAmount: a.sellAmount,
    priceMin: a.priceMin,
    priceMax: a.priceMax,
    status: a.status,
    walletAddress: a.wallet.address,
    createdAt: a.createdAt,
  }));
}

/**
 * Remove an agent
 */
export function removeAgent(agentId) {
  agents.delete(agentId);
}

export { agents };
