/**
 * Finish the in-flight e2e trade.
 * Seller's createOrder already landed (tx 0x25105ab8...); we parse the receipt
 * for the real bytes32 orderId, then call fulfillOrder via the buyer's MPC wallet.
 */
import 'dotenv/config';
import { ethers } from 'ethers';
import { executeContract } from './planbok-client.js';

const RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const WALLET_SWAP = '0xD605C56E969CC51aEe9e350Fc975D8eBcd7FcBF3';
const CREATE_TX = '0x25105ab88e18c729f9e051cb293cd2598fec902440c52ed873f9a4894e7728d7';
const BUYER_WALLET_ID = '';       // will fetch from Planbok by address
const BUYER_ADDRESS = '0x48f1d99bfb893e77b72766474659d65f5dcbc97b';

const ABI = [
  'event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)',
  'function fulfillOrder(bytes32 orderId) external payable',
];

async function findBuyerWalletId() {
  const { listWallets } = await import('./planbok-client.js');
  const wallets = await listWallets();
  const hit = (wallets?.data || wallets)?.find(
    (w) => w.address?.toLowerCase() === BUYER_ADDRESS.toLowerCase(),
  );
  if (!hit) throw new Error(`Buyer wallet ${BUYER_ADDRESS} not found in Planbok`);
  return hit.id || hit._id || hit.walletId;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const receipt = await provider.getTransactionReceipt(CREATE_TX);
  if (!receipt) throw new Error(`No receipt for ${CREATE_TX}`);

  const iface = new ethers.Interface(ABI);
  const event = receipt.logs
    .map((log) => { try { return iface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === 'OrderInitiated');

  let orderId = event?.args?.orderId;
  if (!orderId) {
    const topic = iface.getEvent('OrderInitiated').topicHash;
    const hit = receipt.logs.find((l) => l.topics?.[0] === topic);
    orderId = hit?.topics?.[1];
  }
  if (!orderId) throw new Error('OrderInitiated event not found');
  console.log(`[Finish] Real on-chain orderId: ${orderId}`);

  const walletId = await findBuyerWalletId();
  console.log(`[Finish] Buyer walletId: ${walletId}`);

  // Approve USDC for the DEX
  const USDC = '0x6589B85C82aa4Dd75f68D4AcB791bA3b9747b34e';
  console.log('[Finish] Approving USDC via buyer MPC...');
  const approve = await executeContract({
    walletId,
    contractAddress: USDC,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [WALLET_SWAP, ethers.MaxUint256.toString()],
    refId: 'finish-approve-usdc',
  });
  console.log(`[Finish] Approve submitted: ${approve.txHash}`);
  for (let i = 0; i < 30; i++) {
    const r = await provider.getTransactionReceipt(approve.txHash);
    if (r) { console.log(`[Finish] Approve mined in block ${r.blockNumber}`); break; }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Fulfill — send MIN_GAS_FEE since buyToken is ERC-20 (MOCK, not native)
  console.log('[Finish] Calling fulfillOrder via buyer MPC...');
  const fulfill = await executeContract({
    walletId,
    contractAddress: WALLET_SWAP,
    abiFunctionSignature: 'fulfillOrder(bytes32)',
    abiParameters: [orderId],
    amount: ethers.formatEther(ethers.parseEther('0.002')),
    feeLevel: 'medium',
    refId: `finish-fulfill`,
  });
  console.log(`[Finish] Fulfill submitted: ${fulfill.txHash}`);
  for (let i = 0; i < 45; i++) {
    const r = await provider.getTransactionReceipt(fulfill.txHash);
    if (r) {
      console.log(`[Finish] Fulfill status=${r.status} block=${r.blockNumber}`);
      if (r.status === 1) console.log('✅ TRADE COMPLETE');
      else console.log('❌ Fulfill reverted');
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('⏳ Timed out waiting for fulfill receipt');
}

main().catch((e) => { console.error(e); process.exit(1); });
