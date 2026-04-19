import 'dotenv/config';
import { ethers } from 'ethers';

const WS = '0xD605C56E969CC51aEe9e350Fc975D8eBcd7FcBF3';
const MOCK = '0xab007ED755E3ac0946899dC2DD183362B49Ee207';
const USDC = '0x6589B85C82aa4Dd75f68D4AcB791bA3b9747b34e';
const SELLER = '0xfae8e8aa16ef63ba223febb15bc35fa01f12dc37';

const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address, address) view returns (uint256)',
];

const provider = new ethers.JsonRpcProvider('https://sepolia.gateway.tenderly.co');

const mock = new ethers.Contract(MOCK, ERC20, provider);
const usdc = new ethers.Contract(USDC, ERC20, provider);

console.log('Seller state:');
console.log('  ETH:', ethers.formatEther(await provider.getBalance(SELLER)));
console.log('  MOCK balance:', ethers.formatUnits(await mock.balanceOf(SELLER), 18));
console.log('  MOCK allowance→WS:', ethers.formatUnits(await mock.allowance(SELLER, WS), 18));
console.log('  USDC balance:', ethers.formatUnits(await usdc.balanceOf(SELLER), 6));

// Try various create options to find which arg is causing "Insufficient balance"
const c = new ethers.Contract(WS, [
  'function createOrder(address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256) external payable returns (bytes32)',
  'function estimateTokenMinutesValue(address token, uint256 amount) view returns (uint256)',
], provider);

const mvIn  = await c.estimateTokenMinutesValue(MOCK, ethers.parseUnits('0.1', 18));
const mvOut = await c.estimateTokenMinutesValue(USDC, ethers.parseUnits('0.115', 6));

// Try various value sends
const tries = [
  { value: '0.002', label: '0.002 ETH (MIN_GAS_FEE)' },
  { value: '0.003', label: '0.003 ETH' },
  { value: '0.005', label: '0.005 ETH' },
  { value: '0',     label: '0 ETH' },
];

for (const t of tries) {
  try {
    const res = await c.createOrder.staticCall(
      MOCK, USDC, 0, 0,
      ethers.parseUnits('0.1', 18),
      ethers.parseUnits('0.115', 6),
      mvIn, mvOut,
      50n, 3600n, true, 11155111n,
      { value: ethers.parseEther(t.value), from: SELLER }
    );
    console.log(`[value=${t.label}] OK orderId=${res}`);
  } catch (err) {
    console.log(`[value=${t.label}] ${err.shortMessage || err.reason || err.message?.slice(0,100)}`);
  }
}

// Also try using MIN_GAS_FEE * 2
try {
  const res = await c.createOrder.staticCall(
    MOCK, USDC, 0, 0,
    ethers.parseUnits('0.1', 18),
    ethers.parseUnits('0.115', 6),
    mvIn, mvOut,
    50n, 3600n, true, 11155111n,
    { value: ethers.parseEther('0.1'), from: SELLER, gasLimit: 2_000_000n }
  );
  console.log(`[value=0.1 gasLimit=2M] OK ${res}`);
} catch (err) {
  console.log(`[value=0.1 gasLimit=2M] ${err.shortMessage || err.reason || err.info?.error?.message || err.message?.slice(0,200)}`);
}
