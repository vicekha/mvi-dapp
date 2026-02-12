# MVI DApp - Complete Integration

**Micro Venture Initiative (MVI) - Reactive Network Non-Custodial Wallet-to-Wallet Swap DApp**

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge&logo=cloudflare)](https://master.mvi-autoswap.pages.dev)

A production-ready, fully integrated DApp combining smart contracts and frontend for time-validated token swaps across multiple blockchains using Reactive Network's event-driven architecture.

---

## 📋 Project Structure

```
mvi-dapp-complete/
├── contracts/                    # Smart contracts (Foundry project)
│   ├── src/                      # 6 Solidity contracts
│   ├── script/                   # Deployment scripts
│   ├── test/                     # Test suite
│   ├── foundry.toml              # Foundry config
│   ├── package.json              # Dependencies
│   ├── Makefile                  # Build automation
│   ├── .env.example              # Environment template
│   └── [Documentation files]
│
├── frontend/                     # React DApp (Vite project)
│   ├── src/                      # React source code
│   ├── public/                   # Static assets
│   ├── index.html                # HTML entry point
│   ├── package.json              # Dependencies
│   ├── vite.config.ts            # Vite config
│   ├── tsconfig.json             # TypeScript config
│   ├── tailwind.config.ts        # Tailwind config
│   └── README.md
│
├── docs/                         # Documentation
│   ├── SETUP_GUIDE.md            # Complete setup instructions
│   ├── DEPLOYMENT_GUIDE.md       # Contract deployment
│   ├── INTEGRATION_GUIDE.md      # Frontend integration
│   ├── ARCHITECTURE.md           # System architecture
│   └── TROUBLESHOOTING.md        # Common issues & fixes
│
└── README.md                     # This file
```

---

## 🚀 Quick Start (10 Minutes)

### Prerequisites
- Node.js 18+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- MetaMask or compatible Web3 wallet
- Testnet funds (Sepolia, Polygon Amoy, or Lasna)

### Step 1: Deploy Smart Contracts

```bash
# Navigate to contracts directory
cd contracts

# Setup environment
cp .env.example .env
# Edit .env with:
# - PRIVATE_KEY=your_private_key
# - SEPOLIA_RPC_URL=your_rpc_url
# - POLYGON_AMOY_RPC_URL=your_rpc_url
# - LASNA_RPC_URL=https://rpc.lasna.reactive.network

# Build contracts
forge build

# Run tests
forge test

# Deploy to Lasna testnet
make deploy-lasna

# Save the deployed contract addresses
```

### Step 2: Configure Frontend

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Update contract addresses
# Edit src/config/contracts.ts with deployed addresses from Step 1

# Start dev server
npm run dev

# Open http://localhost:3000 in your browser
```

### Step 3: Test the DApp

1. Click "Connect Wallet" to connect MetaMask
2. Select tokens and amount
3. Choose time validation period
4. Select target chain
5. Click "Create Order" to initiate swap

---

## 📚 Documentation

### For Smart Contract Development
- **SETUP_GUIDE.md** - Environment setup and prerequisites
- **DEPLOYMENT_GUIDE.md** - Contract deployment procedures
- **contracts/README.md** - Contract architecture and functions
- **contracts/DEPLOYMENT_CHECKLIST.md** - Pre-deployment verification

### For Frontend Development
- **INTEGRATION_GUIDE.md** - Connecting frontend to contracts
- **frontend/README.md** - Frontend architecture and components
- **ARCHITECTURE.md** - Complete system architecture

### For Troubleshooting
- **TROUBLESHOOTING.md** - Common issues and solutions
- **contracts/Makefile** - Available build commands

---

## 🏗️ Architecture Overview

### Smart Contracts Layer

**6 Core Contracts:**

1. **WalletSwapMain.sol** - Orchestrator
   - Order creation and management
   - Cross-chain callback coordination
   - Automatic debt coverage

2. **EulerLagrangeOrderProcessor.sol** - Order Processing
   - Intelligent order processing
   - Volume-based tier system
   - Auto-rebooking logic

3. **VirtualLiquidityPool.sol** - Liquidity Management
   - Euler-Lagrange optimization
   - Dynamic pricing
   - Liquidity tracking

4. **TrustWalletFeeDistributor.sol** - Fee Management
   - Fee collection (1%)
   - Automatic debt coverage
   - Fee distribution

5. **AssetVerifier.sol** - Asset Verification
   - Token ownership verification
   - NFT verification
   - Whitelist management

6. **ReactiveHyperlaneBridge.sol** - Cross-Chain Bridge
   - Hyperlane integration
   - Multi-chain token transfers
   - Bridge fee handling

### Frontend Layer

**React Components:**

- **Header** - Wallet connection, chain selector
- **TimeValidatedSwap** - Main swap interface
- **Token Selector** - Token selection with search
- **Amount Input** - Amount entry with validation
- **Time Validator** - Time period selector
- **Fee Display** - Real-time fee breakdown
- **Order History** - Track swap orders

**State Management:**

- **web3Store** - Wallet and chain state
- **swapStore** - Order and swap state

### Reactive Network Integration

**Event-Driven Architecture:**

```
User Creates Order
    ↓
Event Emitted on Origin Chain
    ↓
Reactive Network Listens
    ↓
Callback Triggered on Destination Chain
    ↓
Tokens Transferred to User
    ↓
Fee Collected & Debt Covered
```

---

## 🔧 Development Workflow

### Smart Contracts

```bash
cd contracts

# Build
forge build

# Test
forge test
forge test --gas-report

# Deploy
make deploy-lasna
make deploy-sepolia
make deploy-amoy

# Verify
forge verify-contract <ADDRESS> <CONTRACT_NAME>
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check
```

---

## 📊 Supported Networks

| Network | Chain ID | Status |
|---------|----------|--------|
| Sepolia | 11155111 | ✅ Testnet |
| Polygon Amoy | 80002 | ✅ Testnet |
| Reactive Network (Lasna) | 111 | ✅ Testnet |

---

## 💰 Fee Structure

- **Swap Fee**: 1% (collected on order creation)
- **Bridge Fee**: 0.5% (for cross-chain transfers)
- **Minimum Fee**: 0.01 min
- **Reactive Network Fee**: Covered by accumulated swap fees

---

## 🎯 Time Validation Options

| Option | Duration | Rate Multiplier |
|--------|----------|-----------------|
| Instant | 0-5 min | 1.0x |
| Short | 5-30 min | 1.05x |
| Medium | 30-60 min | 1.10x |
| Long | 1-4 hours | 1.15x |
| Extended | 4-24 hours | 1.20x |

---

## 🔐 Security Features

✅ **Non-Custodial** - Users control private keys  
✅ **Reentrancy Protection** - ReentrancyGuard on critical functions  
✅ **Safe ERC20 Transfers** - Using SafeERC20 library  
✅ **Access Control** - Ownable for admin functions  
✅ **Input Validation** - Comprehensive require statements  
✅ **Event Logging** - Full audit trail on-chain  

---

## 📦 Deployment Checklist

### Pre-Deployment
- [ ] Contracts compile without errors
- [ ] All tests pass
- [ ] Environment variables configured
- [ ] Private key secured
- [ ] Testnet funds available

### Deployment
- [ ] Deploy contracts to testnet
- [ ] Verify contract addresses
- [ ] Update frontend config
- [ ] Test wallet connection
- [ ] Create test swap

### Post-Deployment
- [ ] Verify contract state
- [ ] Monitor gas usage
- [ ] Test cross-chain callbacks
- [ ] Verify fee collection
- [ ] Monitor debt coverage

---

## 🐛 Troubleshooting

### Smart Contracts

**Build fails:**
```bash
# Clean and rebuild
rm -rf out/
forge build
```

**Tests fail:**
- Check RPC URLs in .env
- Ensure testnet funds available
- Verify contract addresses

**Deployment fails:**
- Verify private key is correct
- Check gas price settings
- Ensure sufficient balance

### Frontend

**npm install fails:**
```bash
npm install --legacy-peer-deps
```

**Build fails:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Wallet connection fails:**
- Ensure MetaMask is installed
- Check network is supported
- Verify contract addresses in config

See **TROUBLESHOOTING.md** for more solutions.

---

## 📞 Support & Resources

### Documentation
- [Foundry Book](https://book.getfoundry.sh/)
- [Vite Documentation](https://vitejs.dev/)
- [ethers.js v6](https://docs.ethers.org/v6/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Reactive Network](https://dev.reactive.network/)

### Key Files
- Smart Contracts: `contracts/src/`
- Frontend: `frontend/src/`
- Tests: `contracts/test/`
- Deployment Scripts: `contracts/script/`

---

## 📋 File Sizes

| Component | Size |
|-----------|------|
| Contracts | ~2 MB (with node_modules) |
| Frontend | ~500 MB (with node_modules) |
| Total (without node_modules) | ~100 KB |

---

## 🎓 Learning Resources

### Smart Contracts
1. Read `contracts/README.md` for contract overview
2. Review `contracts/src/` for implementation details
3. Study `contracts/test/` for usage examples

### Frontend
1. Read `frontend/README.md` for component overview
2. Review `frontend/src/config/contracts.ts` for configuration
3. Study `frontend/src/pages/TimeValidatedSwap.tsx` for main interface

### Integration
1. Follow `INTEGRATION_GUIDE.md` for step-by-step setup
2. Review `ARCHITECTURE.md` for system design
3. Check `docs/` for detailed documentation

---

## ✅ Next Steps

1. **Setup Environment** - Follow SETUP_GUIDE.md
2. **Deploy Contracts** - Use DEPLOYMENT_GUIDE.md
3. **Configure Frontend** - Update contract addresses
4. **Run DApp** - Start dev server
5. **Test Swaps** - Create test orders
6. **Deploy to Production** - Follow deployment procedures

---

## 📝 Version Info

- **Version**: 1.0
- **Status**: Production Ready
- **Last Updated**: January 3, 2026
- **Solidity**: ^0.8.0
- **React**: 19
- **Node.js**: 18+

---

## 📄 License

This project is provided as-is for development and testing purposes.

---

## 🤝 Contributing

For improvements or bug reports, please refer to the documentation and troubleshooting guides.

---

**Ready to deploy? Start with the SETUP_GUIDE.md in the docs/ folder!**
