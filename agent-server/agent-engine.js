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

      // Planbok's internal indexer / fee estimator lags the chain by ~20–45s after a
      // fresh deposit — even after the tx is confirmed on Sepolia, Planbok's pre-flight
      // check for contract-execution returns 422 "Insufficient funds for transaction"
      // until its indexer catches up. Without this wait, the very first settlement
      // after an agent is created always 422s on the seller-side approve. Tunable via
      // PLANBOK_WARMUP_MS (default 45s). Set to 0 to skip in offline/mock tests.
      const warmupMs = parseInt(process.env.PLANBOK_WARMUP_MS ?? '45000', 10);
      if (warmupMs > 0 && wallet.walletId && !String(wallet.walletId).startsWith('mock-')) {
        console.log(`[Agent ${id}] Waiting ${warmupMs}ms for Planbok indexer to see funding...`);
        await new Promise(r => setTimeout(r, warmupMs));
      }
    } catch (err) {
      console.error(`[Agent ${id}] Funding failed:`, err.message);
      // Rethrow so the HTTP handler returns 500 and we don't register an
      // unfunded zombie agent that the matchmaker would later pair into a
      // doomed settlement.
      throw new Error(`Funding failed for ${sellToken.symbol}: ${err.message}`);
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
  } else if (sellToken.type === 'ERC721') {
    // ERC-721 NFT: transfer N specific tokenIds owned by the server wallet.
    // Send 0.005 ETH for gas first, then safeTransferFrom for each NFT.
    const ERC721_ABI = [
      'function balanceOf(address owner) view returns (uint256)',
      'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
      'function ownerOf(uint256 tokenId) view returns (address)',
      'function safeTransferFrom(address from, address to, uint256 tokenId)',
    ];
    const nft = new ethers.Contract(sellToken.address, ERC721_ABI, serverWallet);
    const count = Math.max(1, Math.floor(fundAmount));

    // Send gas ETH so the MPC wallet can later call approve/safeTransferFrom for settlement
    const gasEth = ethers.parseEther('0.01');
    console.log(`[Fund] Sending ${ethers.formatEther(gasEth)} ETH for gas to ${agentAddress}`);
    const gasTx = await serverWallet.sendTransaction({ to: agentAddress, value: gasEth });
    await gasTx.wait();

    // Collect tokenIds to transfer. Try Enumerable first, fall back to scanning Transfer events.
    const tokenIds = [];
    try {
      const bal = await nft.balanceOf(serverWallet.address);
      const have = Number(bal);
      if (have < count) throw new Error(`Server wallet owns ${have} ${sellToken.symbol}, need ${count}`);
      for (let i = 0; i < count; i++) {
        const id = await nft.tokenOfOwnerByIndex(serverWallet.address, i);
        tokenIds.push(id);
      }
    } catch (enumErr) {
      // Not Enumerable — probe tokenIds 0..200 directly. Small mock NFT collections.
      console.log(`[Fund] ${sellToken.symbol} not Enumerable, probing ownerOf: ${enumErr.shortMessage || enumErr.message}`);
      const me = serverWallet.address.toLowerCase();
      for (let id = 0n; id <= 200n && tokenIds.length < count; id++) {
        try {
          const owner = await nft.ownerOf(id);
          if (owner.toLowerCase() === me) tokenIds.push(id);
        } catch { /* nonexistent tokenId */ }
      }
      if (tokenIds.length < count) {
        // Fallback: scan recent Transfer events as last resort
        const iface = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
        const topicTransfer = iface.getEvent('Transfer').topicHash;
        const topicToOwner = ethers.zeroPadValue(serverWallet.address.toLowerCase(), 32);
        const latest = await provider.getBlockNumber();
        const logs = await provider.getLogs({
          address: sellToken.address,
          topics: [topicTransfer, null, topicToOwner],
          fromBlock: Math.max(0, latest - 9_000), toBlock: latest,
        });
        const candidates = [...new Set(logs.map(l => BigInt(l.topics[3])))];
        for (const id of candidates) {
          if (tokenIds.length >= count) break;
          try {
            const owner = await nft.ownerOf(id);
            if (owner.toLowerCase() === me) tokenIds.push(id);
          } catch { /* ignore */ }
        }
      }
      if (tokenIds.length < count) throw new Error(`Could not find ${count} owned ${sellToken.symbol} tokenIds (found ${tokenIds.length})`);
    }

    let lastTx;
    for (const id of tokenIds) {
      console.log(`[Fund] Transferring ${sellToken.symbol} #${id} to ${agentAddress}`);
      const tx = await nft['safeTransferFrom(address,address,uint256)'](serverWallet.address, agentAddress, id);
      await tx.wait();
      lastTx = tx;
    }
    return lastTx;
  } else {
    // Transfer ERC-20 token + a small ETH amount for gas
    const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];
    const tokenContract = new ethers.Contract(sellToken.address, ERC20_ABI, serverWallet);
    const decimals = sellToken.decimals || 18;
    // +1% headroom over requested fundAmount to cover DEX fee on createOrder.
    // WalletSwapMain.createOrder pulls a fee (TrustWalletFeeDistributor: 5 bps of amountIn)
    // via safeTransferFrom BEFORE AssetVerifier.verifyToken(tokenIn, maker, amountIn) runs.
    // Without headroom, `balance < amountIn` and the order reverts "Insufficient balance".
    const fundWithHeadroom = (Number(fundAmount) * 1.01).toFixed(decimals > 6 ? 8 : 6);
    const amount = ethers.parseUnits(fundWithHeadroom, decimals);

    // Send gas ETH first. Planbok's fee estimator is conservative — it rejects
    // contract-execution with 422 "Insufficient funds" when the wallet has only
    // 0.005 ETH even though actual gas is < 0.0004 ETH. 0.01 ETH gives headroom
    // for 1–2 settlements (approve + fulfillOrder) per agent without hitting that.
    const gasEth = ethers.parseEther('0.01');
    console.log(`[Fund] Sending ${ethers.formatEther(gasEth)} ETH for gas to ${agentAddress}`);
    const gasTx = await serverWallet.sendTransaction({ to: agentAddress, value: gasEth });
    await gasTx.wait();

    // Then transfer the ERC-20
    console.log(`[Fund] Transferring ${fundWithHeadroom} ${sellToken.symbol} to ${agentAddress} (${fundAmount} + 1% fee headroom)`);
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
