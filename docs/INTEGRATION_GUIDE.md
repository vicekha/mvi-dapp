# Frontend-Contract Integration Guide

This guide explains how the frontend DApp integrates with the deployed smart contracts.

---

## 🔗 Integration Overview

```
Frontend (React)
    ↓
ethers.js v6
    ↓
Web3 Provider (MetaMask)
    ↓
Smart Contracts (Solidity)
    ↓
Blockchain (Sepolia/Amoy/Lasna)
```

---

## 📝 Step 1: Update Contract Configuration

### 1.1 Locate Configuration File

```
frontend/src/config/contracts.ts
```

### 1.2 Add Deployed Addresses

After deploying contracts, update the configuration:

```typescript
export const CONTRACTS = {
  111: { // Lasna testnet (Chain ID)
    walletSwapMain: '0x1234567890123456789012345678901234567890',
    virtualLiquidityPool: '0x0987654321098765432109876543210987654321',
    orderProcessor: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    feeDistributor: '0xfedcbafedcbafedcbafedcbafedcbafedcbafed',
    assetVerifier: '0x1111111111111111111111111111111111111111',
    bridge: '0x2222222222222222222222222222222222222222',
  },
  11155111: { // Sepolia testnet
    walletSwapMain: '0x...',
    // ... other addresses
  },
  80002: { // Polygon Amoy
    walletSwapMain: '0x...',
    // ... other addresses
  },
};
```

### 1.3 Add Token Configuration

```typescript
export const TOKENS = {
  111: [ // Lasna
    { symbol: 'USDC', address: '0x...', decimals: 6 },
    { symbol: 'USDT', address: '0x...', decimals: 6 },
    { symbol: 'DAI', address: '0x...', decimals: 18 },
    { symbol: 'RVT', address: '0xNATIVE', decimals: 18 }, // Native token
  ],
  // ... other chains
};
```

---

## 🔌 Step 2: Connect Wallet

### 2.1 Wallet Connection Flow

The `Header.tsx` component handles wallet connection:

```typescript
// src/components/Header.tsx
import { useWeb3Store } from '../store/web3Store';

export function Header() {
  const { connectWallet, account, chain } = useWeb3Store();

  const handleConnect = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  return (
    <header>
      {account ? (
        <div>Connected: {account.slice(0, 6)}...{account.slice(-4)}</div>
      ) : (
        <button onClick={handleConnect}>Connect Wallet</button>
      )}
    </header>
  );
}
```

### 2.2 Web3 Store

The `web3Store.ts` manages wallet state:

```typescript
// src/store/web3Store.ts
import { create } from 'zustand';
import { BrowserProvider } from 'ethers';

export const useWeb3Store = create((set) => ({
  provider: null,
  signer: null,
  account: null,
  chain: null,

  connectWallet: async () => {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const account = await signer.getAddress();
    const network = await provider.getNetwork();

    set({ provider, signer, account, chain: network.chainId });
  },
}));
```

---

## 📋 Step 3: Create Order

### 3.1 Order Creation Flow

```typescript
// src/pages/TimeValidatedSwap.tsx
import { useWeb3Store } from '../store/web3Store';
import { useSwapStore } from '../store/swapStore';
import { CONTRACTS } from '../config/contracts';

export function TimeValidatedSwap() {
  const { signer, account } = useWeb3Store();
  const { createOrder } = useSwapStore();

  const handleCreateOrder = async () => {
    // 1. Get contract instance
    const contract = new ethers.Contract(
      CONTRACTS[chainId].walletSwapMain,
      WALLET_SWAP_ABI,
      signer
    );

    // 2. Prepare order data
    const orderData = {
      fromToken: selectedFromToken,
      toToken: selectedToToken,
      amount: ethers.parseUnits(amount, 6),
      timeValidation: selectedTime,
      targetChain: selectedChain,
      recipient: account,
    };

    // 3. Create order
    const tx = await contract.createOrder(
      orderData.fromToken,
      orderData.toToken,
      orderData.amount,
      orderData.timeValidation,
      orderData.targetChain,
      orderData.recipient
    );

    // 4. Wait for confirmation
    const receipt = await tx.wait();

    // 5. Update UI
    await createOrder({
      txHash: receipt.transactionHash,
      ...orderData,
    });
  };

  return (
    <button onClick={handleCreateOrder}>
      Create Order
    </button>
  );
}
```

### 3.2 Contract Interaction

The frontend calls these contract functions:

```solidity
// WalletSwapMain.sol
function createOrder(
    address fromToken,
    address toToken,
    uint256 amount,
    uint8 timeValidation,
    uint256 targetChain,
    address recipient
) external payable returns (uint256 orderId)
```

---

## 💰 Step 4: Fee Calculation

### 4.1 Real-Time Fee Display

```typescript
// src/pages/TimeValidatedSwap.tsx
import { calculateFees } from '../lib/feeCalculator';

export function TimeValidatedSwap() {
  const [amount, setAmount] = useState('0');
  const [fees, setFees] = useState(null);

  useEffect(() => {
    if (amount && selectedFromToken && selectedToToken) {
      const calculated = calculateFees({
        amount: ethers.parseUnits(amount, 6),
        fromToken: selectedFromToken,
        toToken: selectedToToken,
        timeValidation: selectedTime,
        isCrossChain: selectedChain !== currentChain,
      });
      setFees(calculated);
    }
  }, [amount, selectedFromToken, selectedToToken, selectedTime]);

  return (
    <div className="fee-breakdown">
      <div>Swap Fee: {fees?.swapFee}%</div>
      <div>Bridge Fee: {fees?.bridgeFee}%</div>
      <div>Total Fee: {fees?.totalFee}%</div>
      <div>Min Fee: {fees?.minFee}</div>
    </div>
  );
}
```

### 4.2 Fee Calculation Logic

```typescript
// src/lib/feeCalculator.ts
export function calculateFees({
  amount,
  fromToken,
  toToken,
  timeValidation,
  isCrossChain,
}) {
  const SWAP_FEE_PERCENT = 1; // 1%
  const BRIDGE_FEE_PERCENT = 0.5; // 0.5%
  const MIN_FEE = ethers.parseUnits('0.01', 6);

  let totalFee = (amount * SWAP_FEE_PERCENT) / 100;

  if (isCrossChain) {
    totalFee += (amount * BRIDGE_FEE_PERCENT) / 100;
  }

  // Apply time validation multiplier
  const timeMultiplier = getTimeMultiplier(timeValidation);
  const outputAmount = amount * timeMultiplier;

  return {
    swapFee: SWAP_FEE_PERCENT,
    bridgeFee: isCrossChain ? BRIDGE_FEE_PERCENT : 0,
    totalFee: (totalFee / amount) * 100,
    minFee: MIN_FEE,
    outputAmount,
  };
}
```

---

## 📊 Step 5: Monitor Orders

### 5.1 Fetch Order History

```typescript
// src/store/swapStore.ts
export const useSwapStore = create((set, get) => ({
  orders: [],

  fetchOrders: async (account) => {
    const { provider } = useWeb3Store.getState();
    const contract = new ethers.Contract(
      CONTRACTS[chainId].walletSwapMain,
      WALLET_SWAP_ABI,
      provider
    );

    // Get all orders for account
    const events = await contract.queryFilter(
      contract.filters.OrderCreated(account),
      0,
      'latest'
    );

    const orders = events.map((event) => ({
      orderId: event.args.orderId,
      fromToken: event.args.fromToken,
      toToken: event.args.toToken,
      amount: event.args.amount,
      status: event.args.status,
      txHash: event.transactionHash,
      timestamp: event.blockNumber,
    }));

    set({ orders });
  },
}));
```

### 5.2 Track Order Status

```typescript
// src/pages/TimeValidatedSwap.tsx
export function OrderHistory() {
  const { orders } = useSwapStore();
  const { provider } = useWeb3Store();

  useEffect(() => {
    // Subscribe to order updates
    const contract = new ethers.Contract(
      CONTRACTS[chainId].walletSwapMain,
      WALLET_SWAP_ABI,
      provider
    );

    contract.on('OrderFilled', (orderId, status) => {
      console.log(`Order ${orderId} filled with status ${status}`);
      // Update UI
    });

    return () => {
      contract.removeAllListeners();
    };
  }, []);

  return (
    <div className="order-history">
      {orders.map((order) => (
        <OrderCard key={order.orderId} order={order} />
      ))}
    </div>
  );
}
```

---

## 🔄 Step 6: Handle Events

### 6.1 Contract Events

The frontend listens to these contract events:

```solidity
// WalletSwapMain.sol
event OrderCreated(
    uint256 indexed orderId,
    address indexed creator,
    address fromToken,
    address toToken,
    uint256 amount,
    uint8 timeValidation
);

event OrderFilled(
    uint256 indexed orderId,
    address indexed recipient,
    uint256 outputAmount,
    uint256 timestamp
);

event FeesCollected(
    uint256 indexed orderId,
    uint256 feeAmount,
    address feeRecipient
);
```

### 6.2 Event Listeners

```typescript
// src/hooks/useOrderEvents.ts
export function useOrderEvents() {
  const { provider } = useWeb3Store();
  const { updateOrder } = useSwapStore();

  useEffect(() => {
    const contract = new ethers.Contract(
      CONTRACTS[chainId].walletSwapMain,
      WALLET_SWAP_ABI,
      provider
    );

    // Listen to OrderFilled events
    contract.on('OrderFilled', (orderId, recipient, outputAmount) => {
      updateOrder(orderId, {
        status: 'filled',
        outputAmount,
        filledAt: new Date(),
      });
    });

    // Listen to FeesCollected events
    contract.on('FeesCollected', (orderId, feeAmount) => {
      console.log(`Fees collected for order ${orderId}: ${feeAmount}`);
    });

    return () => {
      contract.removeAllListeners();
    };
  }, []);
}
```

---

## 🔐 Step 7: Approve Tokens

### 7.1 Token Approval

Before creating an order, user must approve tokens:

```typescript
// src/lib/tokenApproval.ts
export async function approveToken(
  tokenAddress,
  spenderAddress,
  amount,
  signer
) {
  const erc20 = new ethers.Contract(
    tokenAddress,
    ERC20_ABI,
    signer
  );

  const tx = await erc20.approve(spenderAddress, amount);
  await tx.wait();

  return tx.hash;
}
```

### 7.2 Check Allowance

```typescript
// src/lib/tokenApproval.ts
export async function checkAllowance(
  tokenAddress,
  ownerAddress,
  spenderAddress,
  provider
) {
  const erc20 = new ethers.Contract(
    tokenAddress,
    ERC20_ABI,
    provider
  );

  const allowance = await erc20.allowance(ownerAddress, spenderAddress);
  return allowance;
}
```

---

## 🌐 Step 8: Multi-Chain Support

### 8.1 Chain Switching

```typescript
// src/store/web3Store.ts
export const useWeb3Store = create((set) => ({
  switchChain: async (chainId) => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainHexId: `0x${chainId.toString(16)}` }],
      });
      set({ chain: chainId });
    } catch (error) {
      // Chain not added, add it
      await addChain(chainId);
    }
  },

  addChain: async (chainId) => {
    const chainConfig = CHAIN_CONFIGS[chainId];
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [chainConfig],
    });
  },
}));
```

### 8.2 Chain Configuration

```typescript
// src/config/chains.ts
export const CHAIN_CONFIGS = {
  111: { // Lasna
    chainId: '0x6f',
    chainName: 'Reactive Network (Lasna)',
    rpcUrls: ['https://rpc.lasna.reactive.network'],
    blockExplorerUrls: ['https://lasna.reactscan.net'],
    nativeCurrency: { name: 'RVT', symbol: 'RVT', decimals: 18 },
  },
  11155111: { // Sepolia
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    rpcUrls: ['https://sepolia.infura.io/v3/{KEY}'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  },
  80002: { // Polygon Amoy
    chainId: '0x13882',
    chainName: 'Polygon Amoy',
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    blockExplorerUrls: ['https://amoy.polygonscan.com'],
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  },
};
```

---

## 🧪 Step 9: Testing Integration

### 9.1 Test Wallet Connection

```typescript
// src/__tests__/integration.test.ts
describe('Wallet Integration', () => {
  it('should connect wallet', async () => {
    const { connectWallet, account } = useWeb3Store.getState();
    await connectWallet();
    expect(account).toBeDefined();
  });
});
```

### 9.2 Test Order Creation

```typescript
describe('Order Creation', () => {
  it('should create order', async () => {
    const { createOrder } = useSwapStore.getState();
    const orderId = await createOrder({
      fromToken: '0x...',
      toToken: '0x...',
      amount: ethers.parseUnits('100', 6),
    });
    expect(orderId).toBeDefined();
  });
});
```

### 9.3 Test Fee Calculation

```typescript
describe('Fee Calculation', () => {
  it('should calculate fees correctly', () => {
    const fees = calculateFees({
      amount: ethers.parseUnits('1000', 6),
      isCrossChain: true,
    });
    expect(fees.totalFee).toBe(1.5); // 1% + 0.5%
  });
});
```

---

## 📚 Contract ABIs

### 9.1 Where to Find ABIs

ABIs are located in:
```
contracts/out/
├── WalletSwapMain.sol/
│   └── WalletSwapMain.json
├── VirtualLiquidityPool.sol/
│   └── VirtualLiquidityPool.json
└── ... other contracts
```

### 9.2 Using ABIs in Frontend

```typescript
// src/config/abis.ts
import WalletSwapABI from '../../../contracts/out/WalletSwapMain.sol/WalletSwapMain.json';
import ERC20ABI from '../abis/ERC20.json';

export const ABIS = {
  walletSwap: WalletSwapABI.abi,
  erc20: ERC20ABI,
};
```

---

## 🔍 Debugging

### 10.1 Enable Debug Logging

```typescript
// src/config/debug.ts
export const DEBUG = process.env.NODE_ENV === 'development';

export function log(message, data) {
  if (DEBUG) {
    console.log(`[MVI] ${message}`, data);
  }
}
```

### 10.2 Monitor Transactions

```typescript
// src/lib/txMonitor.ts
export async function monitorTransaction(txHash, provider) {
  const receipt = await provider.waitForTransaction(txHash);
  console.log('Transaction confirmed:', receipt);
  return receipt;
}
```

---

## ✅ Integration Checklist

- [ ] Contract addresses updated in config
- [ ] Token configuration added
- [ ] Wallet connection tested
- [ ] Order creation tested
- [ ] Fee calculation verified
- [ ] Event listeners working
- [ ] Multi-chain switching works
- [ ] Order history displays
- [ ] All tests passing

---

## 📞 Troubleshooting

### Contract Not Found

**Error:** `Contract address is not a contract`

**Solution:**
```typescript
// Verify contract is deployed
const code = await provider.getCode(contractAddress);
if (code === '0x') {
  console.error('Contract not deployed at address');
}
```

### Insufficient Allowance

**Error:** `ERC20: insufficient allowance`

**Solution:**
```typescript
// Approve tokens before creating order
await approveToken(
  tokenAddress,
  CONTRACTS[chainId].walletSwapMain,
  amount,
  signer
);
```

### Wrong Chain

**Error:** `Chain ID mismatch`

**Solution:**
```typescript
// Switch to correct chain
await switchChain(111); // Lasna testnet
```

---

## 📖 Additional Resources

- [ethers.js Documentation](https://docs.ethers.org/v6/)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [MetaMask API](https://docs.metamask.io/guide/rpc-api.html)
- [Reactive Network Docs](https://dev.reactive.network/)

---

**Integration Complete! Your DApp is ready to use.**
