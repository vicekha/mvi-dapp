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

// Whether to fall back to the server/master private key when a Planbok MPC call fails.
// Default OFF — in a live demo the agent's own MPC wallet must sign every settlement;
// silently substituting the master wallet breaks the trust story ("agents hold their
// own funds") and leaves funds with the wrong party on-chain. Flip this on for dev
// runs where the master wallet acts as a safety net during Planbok outages.
const ALLOW_SERVER_FALLBACK = /^(1|true|yes|on)$/i.test(
  process.env.AUTOSWAP_ALLOW_SERVER_FALLBACK || ''
);
if (ALLOW_SERVER_FALLBACK) {
  console.warn('[Settlement] ⚠️  AUTOSWAP_ALLOW_SERVER_FALLBACK=on — failed Planbok calls will substitute the master wallet. Disable for live demos.');
}

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
      console.error('[Settlement] Planbok MPC (seller) failed:', planbokErr.message);
      if (ALLOW_SERVER_FALLBACK && process.env.AUTOSWAP_PRIVATE_KEY) {
        console.warn('[Settlement] AUTOSWAP_ALLOW_SERVER_FALLBACK=on — seller-side createOrder will be signed by MASTER WALLET (agent MPC wallet will NOT hold the trade).');
        const result = await settleDirectOrder({
          chainId, config, sellToken, buyToken,
          sellAmountWei, buyAmountWei, typeIn, typeOut, targetChainId,
        });
        txHash = result.txHash;
        orderId = result.orderId;
      } else {
        // Live-demo default: surface the failure instead of silently trading from the
        // master wallet. Caller (trySettle) will mark the negotiation failed.
        throw new Error(`Seller MPC settlement failed and server fallback is disabled: ${planbokErr.message}`);
      }
    }
  } else {
    // No Planbok wallet provisioned for this agent (mock wallet / test mode).
    // Only permitted when the operator has explicitly enabled the master-wallet path.
    if (!ALLOW_SERVER_FALLBACK) {
      throw new Error(`Agent ${agentA.id} has no Planbok MPC wallet and server fallback is disabled (set AUTOSWAP_ALLOW_SERVER_FALLBACK=1 for dev).`);
    }
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
 *
 * Critical ordering: when the buyer pays with an ERC-20, the buyer MUST have an allowance
 * on WalletSwapMain BEFORE fulfillOrder is called, otherwise the contract reverts with
 * "ERC20: insufficient allowance". We explicitly do the approve step first and wait for
 * it to confirm on-chain before attempting fulfill.
 */
async function fulfillOrderOnChain({ orderId, chainId, config, buyToken, buyAmountWei, agentB }) {
  // Calculate msg.value: native-ETH buyer sends buyAmountWei + MIN_GAS_FEE; ERC-20 buyer
  // still needs MIN_GAS_FEE so WalletSwapMain.fulfillOrder doesn't revert with
  // "Insufficient gas fee sent" (same protocol-level convention as createOrder).
  let value = MIN_GAS_FEE;
  if (isNative(buyToken.address)) {
    value = buyAmountWei + MIN_GAS_FEE;
  }

  const hasPlanbok = agentB.wallet.walletId && !agentB.wallet.walletId.startsWith('mock-');
  const provider = getProvider(chainId);

  // ── Step A: ensure allowance (ERC-20 buy only) ─────────────────
  // Check allowance against the buyer's actual on-chain wallet, regardless of which
  // signer path we end up using. If insufficient, approve via Planbok (preferred) and
  // fall back to the server/master wallet. Either way we await the receipt so the
  // subsequent fulfillOrder sees the new allowance.
  if (!isNative(buyToken.address)) {
    const buyerAddress = hasPlanbok
      ? agentB.wallet.address
      : getSigner(chainId).address;

    const erc20View = new ethers.Contract(buyToken.address, ERC20_ABI, provider);
    const currentAllowance = await erc20View.allowance(buyerAddress, config.WalletSwapMain);

    if (currentAllowance < buyAmountWei) {
      let approveTxHash = null;

      // Try Planbok approve for buyer's MPC wallet first
      if (hasPlanbok) {
        try {
          console.log(`[Settlement] Approving ${buyToken.symbol} for fulfillment via Planbok MPC...`);
          const approveRes = await executeContract({
            walletId: agentB.wallet.walletId,
            contractAddress: buyToken.address,
            abiFunctionSignature: 'approve(address,uint256)',
            abiParameters: [config.WalletSwapMain, ethers.MaxUint256.toString()],
            refId: `approve-fulfill-${buyToken.symbol}`,
          });
          approveTxHash = approveRes.txHash;
        } catch (planbokErr) {
          console.error('[Settlement] Planbok approve (buyer) failed:', planbokErr.message);
          if (!ALLOW_SERVER_FALLBACK) {
            throw new Error(`Buyer MPC approve failed and server fallback is disabled: ${planbokErr.message}`);
          }
          console.warn('[Settlement] AUTOSWAP_ALLOW_SERVER_FALLBACK=on — buyer approve will come from MASTER WALLET.');
        }
      }

      // Fallback: server wallet approve (only reached when Planbok failed AND fallback enabled,
      // or when hasPlanbok=false AND fallback enabled; both guarded above/below).
      if (!approveTxHash) {
        if (!ALLOW_SERVER_FALLBACK) {
          throw new Error('Buyer has no Planbok MPC wallet and server fallback is disabled.');
        }
        const signer = getSigner(chainId);
        const erc20 = new ethers.Contract(buyToken.address, ERC20_ABI, signer);
        const serverAllowance = await erc20.allowance(signer.address, config.WalletSwapMain);
        if (serverAllowance < buyAmountWei) {
          console.log(`[Settlement] Approving ${buyToken.symbol} for fulfillment (server wallet)...`);
          const approveTx = await erc20.approve(config.WalletSwapMain, ethers.MaxUint256);
          const receipt = await approveTx.wait(1);
          approveTxHash = receipt.hash;
          console.log(`[Settlement] Buyer approval confirmed: ${approveTxHash}`);
        }
      } else {
        // Planbok approve succeeded — wait for it to land in a block so the subsequent
        // fulfillOrder sees the allowance. executeContract returns without waiting.
        console.log(`[Settlement] Waiting for Planbok approval ${approveTxHash} to confirm...`);
        await waitForReceipt(provider, approveTxHash, 60_000);
        console.log(`[Settlement] Buyer approval confirmed on-chain`);
      }
    }
  }

  // ── Step B: call fulfillOrder ──────────────────────────────────
  // Live-demo default: buyer's MPC wallet signs the fulfill. If Planbok fails and
  // AUTOSWAP_ALLOW_SERVER_FALLBACK is off, surface the error instead of substituting
  // the master wallet (which would mean the agent's funds never actually left the MPC
  // wallet and the master wallet fulfilled from its own reserves).
  if (hasPlanbok) {
    try {
      // Planbok's `amount` param is a decimal ETH string (NOT wei). `value` was set
      // above to MIN_GAS_FEE or buyAmountWei+MIN_GAS_FEE depending on buyToken kind.
      const result = await executeContract({
        walletId: agentB.wallet.walletId,
        contractAddress: config.WalletSwapMain,
        abiFunctionSignature: 'fulfillOrder(bytes32)',
        abiParameters: [orderId],
        amount: ethers.formatEther(value),
        feeLevel: 'medium',
        refId: `fulfill-${orderId.slice(0, 10)}`,
      });
      if (result.txHash) {
        console.log(`[Settlement] Waiting for Planbok fulfill ${result.txHash} to confirm...`);
        await waitForReceipt(provider, result.txHash, 60_000);
      }
      return { txHash: result.txHash };
    } catch (planbokErr) {
      console.error('[Settlement] Planbok fulfill failed:', planbokErr.message);
      if (!ALLOW_SERVER_FALLBACK) {
        throw new Error(`Buyer MPC fulfill failed and server fallback is disabled: ${planbokErr.message}`);
      }
      console.warn('[Settlement] AUTOSWAP_ALLOW_SERVER_FALLBACK=on — fulfillOrder will be signed by MASTER WALLET (buyer MPC funds will NOT be spent).');
    }
  } else if (!ALLOW_SERVER_FALLBACK) {
    throw new Error('Buyer has no Planbok MPC wallet and server fallback is disabled.');
  }

  // Fallback: server wallet fulfills (only reached when fallback is enabled)
  const signer = getSigner(chainId);
  const contract = new ethers.Contract(config.WalletSwapMain, WALLET_SWAP_ABI, signer);
  const tx = await contract.fulfillOrder(orderId, { value });
  const receipt = await tx.wait();
  console.log(`[Settlement] Fulfill TX confirmed: ${receipt.hash} (block ${receipt.blockNumber})`);
  return { txHash: receipt.hash };
}

/**
 * Poll for a transaction receipt with a timeout. Planbok's executeContract returns
 * as soon as the tx is submitted to the mempool, but the allowance/fulfill ordering
 * requires us to wait for it to actually mine.
 */
async function waitForReceipt(provider, txHash, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider.getTransactionReceipt(txHash).catch(() => null);
    if (receipt && receipt.blockNumber) return receipt;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for receipt ${txHash} after ${timeoutMs}ms`);
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

  // If selling ERC-20, approve first via Planbok contract-execution and wait for
  // the approve tx to land on-chain before attempting createOrder. Planbok's
  // executeContract returns as soon as the tx is submitted to the mempool, so
  // without this wait the subsequent createOrder's estimateGas sees 0 allowance
  // and reverts with "ERC20: insufficient allowance".
  if (!isNative(sellToken.address) && typeIn === 0) {
    console.log(`[Settlement] Approving ${sellToken.symbol} via Planbok MPC...`);
    const approveRes = await executeContract({
      walletId,
      contractAddress: sellToken.address,
      abiFunctionSignature: 'approve(address,uint256)',
      abiParameters: [config.WalletSwapMain, ethers.MaxUint256.toString()],
      refId: `approve-${sellToken.symbol}`,
    });
    if (approveRes?.txHash) {
      console.log(`[Settlement] Waiting for seller approve ${approveRes.txHash} to confirm...`);
      const provider = getProvider(chainId);
      await waitForReceipt(provider, approveRes.txHash, 60_000);
      console.log(`[Settlement] Seller approval confirmed on-chain`);
    }
  }

  // Execute createOrder via Planbok's contract-execution endpoint.
  //
  // IMPORTANT: Planbok's `amount` parameter is a HUMAN-READABLE DECIMAL in the
  // native chain unit (ETH on ETH-SEPOLIA), NOT wei. Passing "2000000000000000"
  // (wei for 0.002 ETH) makes Planbok encode msg.value = 2e33 wei and the tx
  // fails pre-flight with 422 "Insufficient funds for transaction". We convert
  // wei → decimal ETH via formatEther, and omit the field entirely when there's
  // nothing to send (ERC-20 → ERC-20 with no protocol native-fee required).
  const ceParams = {
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
    feeLevel: 'medium',
    refId: `autoswap-order`,
  };
  // WalletSwapMain.createOrder is payable and requires msg.value ≥ MIN_GAS_FEE even
  // for ERC-20 → ERC-20 swaps (the contract reverts with "Insufficient gas fee sent"
  // otherwise). Value is always ≥ MIN_GAS_FEE here (line 370), so always attach it.
  // Planbok interprets `amount` as a decimal ETH string, so convert from wei first.
  if (value > 0n) {
    ceParams.amount = ethers.formatEther(value);
  }
  const result = await executeContract(ceParams);

  // Planbok returns its own internal record id (result.txId), which is a 12-byte
  // hex string — NOT the on-chain bytes32 orderId. The real orderId is emitted
  // by WalletSwapMain in the OrderInitiated event. Wait for the tx receipt and
  // parse the logs so downstream fulfillOrder(bytes32) gets a valid argument.
  let orderId = null;
  if (result?.txHash) {
    const provider = getProvider(chainId);
    const receipt = await waitForReceipt(provider, result.txHash, 90_000);
    const iface = new ethers.Interface(WALLET_SWAP_ABI);
    const event = receipt.logs
      .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
      .find((e) => e?.name === 'OrderInitiated');
    if (event?.args?.orderId) {
      orderId = event.args.orderId;
    } else {
      // Fallback: scan raw logs for the OrderInitiated topic signature
      const topic = iface.getEvent('OrderInitiated').topicHash;
      const hit = receipt.logs.find((l) => l.topics?.[0] === topic);
      if (hit?.topics?.[1]) orderId = hit.topics[1];
    }
  }
  if (!orderId) {
    throw new Error(`createOrder succeeded but OrderInitiated event not found in tx ${result?.txHash}`);
  }

  return { txHash: result.txHash, orderId };
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
