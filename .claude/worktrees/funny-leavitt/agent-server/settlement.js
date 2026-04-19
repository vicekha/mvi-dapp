/**
 * Settlement Module
 * After AI agents agree on a price, this module creates the on-chain order
 * via AutoSwap's WalletSwapMain contract.
 *
 * Flow:
 * 1. Agent A (seller) creates an order on AutoSwap with agreed price
 * 2. Agent B (buyer) fulfills the order
 * 3. Both steps use Planbok MPC wallets for signing (or fallback to server wallet)
 */

import { ethers } from 'ethers';
import { executeContract, executeTransfer, estimateContractFee } from './planbok-client.js';

// Contract addresses per chain
const ADDRESSES = {
  11155111: { // Sepolia — fresh deploy 2026-04-11
    WalletSwapMain: '0xD605C56E969CC51aEe9e350Fc975D8eBcd7FcBF3',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  84532: { // Base Sepolia — fresh deploy 2026-04-11
    WalletSwapMain: '0xc730Aee548da0E51b7F169025eEf3728F309AD71',
    rpc: 'https://sepolia.base.org',
  },
  14601: { // Sonic Testnet
    WalletSwapMain: '0x137186319D83374762FA854fF42Bb772CdA2BAd5',
    rpc: 'https://rpc.blaze.soniclabs.com',
  },
};

// Minimal ABI for WalletSwapMain — only the functions we need
const WALLET_SWAP_ABI = [
  'function createOrder(address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId) external payable returns (bytes32)',
  'function fulfillOrder(bytes32 orderId) external payable',
  'function cancelOrder(bytes32 orderId) external',
  'event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

// Contract expects zero address for native ETH (matching frontend behavior)
const NATIVE_ADDRESS = ethers.ZeroAddress;
const MIN_GAS_FEE = ethers.parseEther('0.002');

/**
 * Get an ethers provider for a chain
 */
function getProvider(chainId) {
  const config = ADDRESSES[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);
  return new ethers.JsonRpcProvider(config.rpc);
}

/**
 * Get a signer — uses server-side private key as fallback when Planbok unavailable
 */
function getSigner(chainId) {
  const provider = getProvider(chainId);
  const pk = process.env.AUTOSWAP_PRIVATE_KEY;
  if (!pk) throw new Error('No AUTOSWAP_PRIVATE_KEY configured for settlement signing');
  return new ethers.Wallet(pk, provider);
}

/**
 * Check if a token address is the native token
 */
function isNative(address) {
  return !address
    || address === ethers.ZeroAddress
    || address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
}

/**
 * Calculate the fee for a trade
 * Native: 0.1% (10 bps), ERC-20: 0.05% (5 bps), NFT: 0%
 */
function calculateFee(amount, tokenType) {
  if (tokenType === 1) return 0n; // NFT — no fee
  const bps = tokenType === 0 ? 5n : 10n; // ERC-20: 5bps, Native: 10bps
  return (amount * bps) / 10000n;
}

/**
 * Settle a negotiation on-chain.
 * Creates an order on AutoSwap from the seller agent's perspective.
 *
 * @param {Object} negotiation - The completed negotiation
 * @param {Object} agentA - Seller agent
 * @param {Object} agentB - Buyer agent
 * @returns {Object} { orderId, txHash, chainId }
 */
export async function settleNegotiation(negotiation, agentA, agentB) {
  if (!negotiation.agreedPrice) {
    throw new Error('Negotiation has no agreed price');
  }

  const chainId = agentA.sellToken.chainId;
  const config = ADDRESSES[chainId];
  if (!config) throw new Error(`No contract deployed on chain ${chainId}`);

  const sellToken = agentA.sellToken;
  const buyToken = agentA.buyToken;
  const agreedPrice = negotiation.agreedPrice;

  // Calculate amounts in wei
  const sellDecimals = sellToken.decimals || 18;
  const buyDecimals = buyToken.decimals || 18;
  const sellAmountRaw = agentA.sellAmount;
  const buyAmountRaw = sellAmountRaw * agreedPrice;

  const sellAmountWei = ethers.parseUnits(sellAmountRaw.toString(), sellDecimals);
  const buyAmountWei = ethers.parseUnits(buyAmountRaw.toFixed(buyDecimals > 6 ? 8 : 6), buyDecimals);

  const typeIn = sellToken.type === 'ERC721' ? 1 : 0;
  const typeOut = buyToken.type === 'ERC721' ? 1 : 0;

  const targetChainId = buyToken.chainId !== chainId ? buyToken.chainId : 0;

  console.log(`[Settlement] Creating order on chain ${chainId}`);
  console.log(`  Sell: ${sellAmountRaw} ${sellToken.symbol} (${sellAmountWei} wei)`);
  console.log(`  Buy:  ${buyAmountRaw.toFixed(6)} ${buyToken.symbol} (${buyAmountWei} wei)`);
  console.log(`  Price: ${agreedPrice} ${buyToken.symbol}/${sellToken.symbol}`);
  console.log(`  Target chain: ${targetChainId || 'same chain'}`);

  // Try Planbok MPC signing first, fall back to server wallet
  let txHash, orderId;

  // Attempt via Planbok MPC wallet
  if (agentA.wallet.walletId && !agentA.wallet.walletId.startsWith('mock-')) {
    try {
      const result = await settlePlanbokOrder({
        walletId: agentA.wallet.walletId,
        chainId, config, sellToken, buyToken,
        sellAmountWei, buyAmountWei, typeIn, typeOut, targetChainId,
      });
      txHash = result.txHash;
      orderId = result.orderId;
    } catch (planbokErr) {
      console.error('[Settlement] Planbok MPC failed, falling back to server wallet:', planbokErr.message);
      // Fallback to server wallet
      if (process.env.AUTOSWAP_PRIVATE_KEY) {
        const result = await settleDirectOrder({
          chainId, config, sellToken, buyToken,
          sellAmountWei, buyAmountWei, typeIn, typeOut, targetChainId,
        });
        txHash = result.txHash;
        orderId = result.orderId;
      } else {
        throw planbokErr;
      }
    }
  } else {
    // No Planbok wallet — use server private key directly
    const result = await settleDirectOrder({
      chainId, config, sellToken, buyToken,
      sellAmountWei, buyAmountWei, typeIn, typeOut, targetChainId,
    });
    txHash = result.txHash;
    orderId = result.orderId;
  }

  console.log(`[Settlement] Order created!`);
  console.log(`  Order ID: ${orderId}`);
  console.log(`  TX Hash:  ${txHash}`);

  // ── Step 2: Agent B fulfills the order ──────────────────────────
  // The buyer calls fulfillOrder(orderId) to complete the swap.
  // For native ETH buys, buyer sends ETH. For ERC-20 buys, buyer sends tokens.
  let fulfillTxHash;
  try {
    console.log(`[Settlement] Agent B fulfilling order ${orderId}...`);

    // Agent B is buying sellToken (Agent A's sellToken) with buyToken (Agent A's buyToken)
    // So Agent B needs to send buyToken (which is Agent A's buyToken = e.g. USDC)
    const fulfillResult = await fulfillOrderOnChain({
      orderId,
      chainId,
      config,
      buyToken,        // Agent B pays this token to fill the order
      buyAmountWei,    // Amount Agent B pays
      agentB,
    });
    fulfillTxHash = fulfillResult.txHash;
    console.log(`[Settlement] Order fulfilled!`);
    console.log(`  Fulfill TX: ${fulfillTxHash}`);
  } catch (err) {
    console.error(`[Settlement] Fulfill failed: ${err.message}`);
    console.log(`[Settlement] Order ${orderId} is live on AutoSwap — can be filled by any taker.`);
  }

  return {
    orderId,
    txHash,
    fulfillTxHash: fulfillTxHash || null,
    chainId,
    agreedPrice,
    sellAmountWei: sellAmountWei.toString(),
    buyAmountWei: buyAmountWei.toString(),
  };
}

/**
 * Fulfill an order on-chain — called by the buyer side after the seller creates the order.
 */
async function fulfillOrderOnChain({ orderId, chainId, config, buyToken, buyAmountWei, agentB }) {
  // Calculate value: if buyer pays native ETH, send it as msg.value
  let value = 0n;
  if (isNative(buyToken.address)) {
    value = buyAmountWei + MIN_GAS_FEE;
  }

  // Try Planbok MPC first (Agent B's wallet), fall back to server wallet
  if (agentB.wallet.walletId && !agentB.wallet.walletId.startsWith('mock-')) {
    try {
      const result = await executeContract({
        walletId: agentB.wallet.walletId,
        contractAddress: config.WalletSwapMain,
        abiFunctionSignature: 'fulfillOrder(bytes32)',
        abiParameters: [orderId],
        amount: value > 0n ? value.toString() : undefined,
        feeLevel: 'medium',
        refId: `fulfill-${orderId.slice(0, 10)}`,
      });
      return { txHash: result.txHash };
    } catch (planbokErr) {
      console.error('[Settlement] Planbok fulfill failed, trying server wallet:', planbokErr.message);
    }
  }

  // Fallback: server wallet fulfills
  const signer = getSigner(chainId);
  const contract = new ethers.Contract(config.WalletSwapMain, WALLET_SWAP_ABI, signer);

  // If buyer pays ERC-20, approve first
  if (!isNative(buyToken.address)) {
    const erc20 = new ethers.Contract(buyToken.address, ERC20_ABI, signer);
    const currentAllowance = await erc20.allowance(signer.address, config.WalletSwapMain);
    if (currentAllowance < buyAmountWei) {
      console.log(`[Settlement] Approving ${buyToken.symbol} for fulfillment...`);
      const approveTx = await erc20.approve(config.WalletSwapMain, ethers.MaxUint256);
      await approveTx.wait();
    }
  }

  const tx = await contract.fulfillOrder(orderId, { value });
  const receipt = await tx.wait();
  console.log(`[Settlement] Fulfill TX confirmed: ${receipt.hash} (block ${receipt.blockNumber})`);
  return { txHash: receipt.hash };
}

/**
 * Settle via Planbok MPC wallet — agent signs the tx through Planbok's contract-execution API.
 * Uses the v2 contract-execution endpoint which handles ABI encoding internally.
 */
async function settlePlanbokOrder({ walletId, chainId, config, sellToken, buyToken, sellAmountWei, buyAmountWei, typeIn, typeOut, targetChainId }) {
  const tokenIn = isNative(sellToken.address) ? NATIVE_ADDRESS : sellToken.address;
  const tokenOut = isNative(buyToken.address) ? NATIVE_ADDRESS : buyToken.address;

  // Calculate native value to send (for payable)
  let value = MIN_GAS_FEE;
  if (isNative(sellToken.address)) {
    const fee = (sellAmountWei * 10n) / 10000n; // 0.1% native fee
    value = sellAmountWei + fee + MIN_GAS_FEE;
  }

  // If selling ERC-20, approve first via Planbok contract-execution
  if (!isNative(sellToken.address) && typeIn === 0) {
    console.log(`[Settlement] Approving ${sellToken.symbol} via Planbok MPC...`);
    await executeContract({
      walletId,
      contractAddress: sellToken.address,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [config.WalletSwapMain, ethers.MaxUint256.toString()],
      refId: `approve-${sellToken.symbol}`,
    });
  }

  // Execute createOrder via Planbok's contract-execution endpoint
  const result = await executeContract({
    walletId,
    contractAddress: config.WalletSwapMain,
    abiFunctionSignature: 'createOrder(address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256)',
    abiParameters: [
      tokenIn,
      tokenOut,
      typeIn.toString(),
      typeOut.toString(),
      sellAmountWei.toString(),
      buyAmountWei.toString(),
      ethers.parseEther('1').toString(), // minutesValueIn
      ethers.parseEther('1').toString(), // minutesValueOut
      '50',    // slippage 0.5%
      '3600',  // 1 hour expiry
      'true',  // enableRebooking
      targetChainId.toString(),
    ],
    amount: value.toString(),
    feeLevel: 'medium',
    refId: `autoswap-order`,
  });

  return { txHash: result.txHash, orderId: result.txId || 'pending' };
}

/**
 * Settle via direct server wallet — fallback when Planbok is unavailable
 */
async function settleDirectOrder({ chainId, config, sellToken, buyToken, sellAmountWei, buyAmountWei, typeIn, typeOut, targetChainId }) {
  const signer = getSigner(chainId);
  const contract = new ethers.Contract(config.WalletSwapMain, WALLET_SWAP_ABI, signer);

  // If selling ERC-20, approve first
  if (!isNative(sellToken.address) && typeIn === 0) {
    const erc20 = new ethers.Contract(sellToken.address, ERC20_ABI, signer);
    const currentAllowance = await erc20.allowance(signer.address, config.WalletSwapMain);
    if (currentAllowance < sellAmountWei) {
      console.log(`[Settlement] Approving ${sellToken.symbol}...`);
      const approveTx = await erc20.approve(config.WalletSwapMain, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`[Settlement] Approved: ${approveTx.hash}`);
    }
  }

  // Calculate value to send
  let value = MIN_GAS_FEE;
  if (isNative(sellToken.address)) {
    const fee = (sellAmountWei * 10n) / 10000n; // 0.1% native fee
    value = sellAmountWei + fee + MIN_GAS_FEE;
  }

  const tx = await contract.createOrder(
    isNative(sellToken.address) ? NATIVE_ADDRESS : sellToken.address,
    isNative(buyToken.address) ? NATIVE_ADDRESS : buyToken.address,
    typeIn, typeOut,
    sellAmountWei, buyAmountWei,
    ethers.parseEther('1'), ethers.parseEther('1'),
    50, 3600, true, targetChainId,
    { value },
  );

  const receipt = await tx.wait();
  console.log(`[Settlement] TX confirmed: ${receipt.hash} (block ${receipt.blockNumber})`);

  // Extract orderId from OrderInitiated event
  const iface = new ethers.Interface(WALLET_SWAP_ABI);
  const orderEvent = receipt.logs
    .map(log => { try { return iface.parseLog(log); } catch { return null; } })
    .find(e => e?.name === 'OrderInitiated');

  const orderId = orderEvent?.args?.orderId || 'unknown';

  return { txHash: receipt.hash, orderId };
}

/**
 * Fulfill an existing order (buyer side)
 */
export async function fulfillOrder(orderId, chainId, buyToken, buyAmountWei) {
  const config = ADDRESSES[chainId];
  if (!config) throw new Error(`No contract on chain ${chainId}`);

  const signer = getSigner(chainId);
  const contract = new ethers.Contract(config.WalletSwapMain, WALLET_SWAP_ABI, signer);

  let value = 0n;
  if (isNative(buyToken.address)) {
    value = buyAmountWei + MIN_GAS_FEE;
  }

  const tx = await contract.fulfillOrder(orderId, { value });
  const receipt = await tx.wait();

  console.log(`[Settlement] Order fulfilled: ${receipt.hash}`);
  return { txHash: receipt.hash };
}
