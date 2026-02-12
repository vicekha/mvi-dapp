# Complete Setup Guide - MVI DApp

This guide walks you through setting up the entire MVI DApp from scratch.

---

## 📋 Prerequisites

### System Requirements
- **OS**: Linux, macOS, or Windows (WSL2)
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 5GB free

### Software Requirements
- **Node.js**: 18.0.0 or higher
- **npm**: 9.0.0 or higher
- **Foundry**: Latest version
- **Git**: 2.0 or higher

### Accounts & Funds
- **MetaMask** or compatible Web3 wallet
- **Testnet ETH**: For Sepolia and Polygon Amoy
- **Testnet RVT**: For Reactive Network (Lasna)

---

## 🔧 Step 1: Install Prerequisites

### 1.1 Install Node.js

**macOS:**
```bash
brew install node
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Download from https://nodejs.org/

**Verify installation:**
```bash
node --version
npm --version
```

### 1.2 Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

**Verify installation:**
```bash
forge --version
cast --version
```

### 1.3 Install Git

**macOS:**
```bash
brew install git
```

**Ubuntu/Debian:**
```bash
sudo apt-get install git
```

**Windows:**
Download from https://git-scm.com/

**Verify installation:**
```bash
git --version
```

---

## 📥 Step 2: Extract & Setup Project

### 2.1 Extract the Project

```bash
unzip mvi-dapp-complete.zip
cd mvi-dapp-complete
```

### 2.2 Verify Project Structure

```bash
ls -la
# Should show:
# contracts/
# frontend/
# docs/
# README.md
```

---

## 🔐 Step 3: Setup Environment Variables

### 3.1 Create .env File for Contracts

```bash
cd contracts
cp .env.example .env
```

### 3.2 Edit .env File

```bash
# Edit with your preferred editor
nano .env
# or
vim .env
```

### 3.3 Fill in Required Variables

```env
# Private key of deployment account (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# RPC URLs for different networks
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
LASNA_RPC_URL=https://rpc.lasna.reactive.network

# Etherscan API keys for verification (optional)
ETHERSCAN_API_KEY=your_etherscan_key
POLYGONSCAN_API_KEY=your_polygonscan_key

# Trust Wallet address (for fee distribution)
TRUST_WALLET=0x...

# Owner address (for contract administration)
OWNER_ADDRESS=0x...
```

### 3.4 Get RPC URLs

**Infura (Sepolia):**
1. Go to https://infura.io/
2. Sign up and create a project
3. Copy Sepolia RPC URL

**Polygon (Amoy):**
- Public RPC: https://rpc-amoy.polygon.technology

**Reactive Network (Lasna):**
- Public RPC: https://rpc.lasna.reactive.network

---

## 💰 Step 4: Get Testnet Funds

### 4.1 Sepolia Faucet

1. Go to https://sepoliafaucet.com/
2. Enter your wallet address
3. Request 0.5 ETH

### 4.2 Polygon Amoy Faucet

1. Go to https://faucet.polygon.technology/
2. Select "Polygon Amoy"
3. Enter your wallet address
4. Request MATIC

### 4.3 Reactive Network (Lasna) Faucet

1. Go to https://faucet.lasna.reactive.network/
2. Enter your wallet address
3. Request RVT tokens

---

## 🏗️ Step 5: Build & Test Smart Contracts

### 5.1 Install Contract Dependencies

```bash
cd contracts
npm install
```

### 5.2 Build Contracts

```bash
forge build
```

**Expected output:**
```
Compiling 6 contracts...
✓ Compilation successful
```

### 5.3 Run Tests

```bash
forge test
```

**Expected output:**
```
Running 10 tests for test/WalletSwap.t.sol:WalletSwapTest
[PASS] testOrderCreation() (gas: 125000)
[PASS] testFeeCollection() (gas: 85000)
...
Test result: ok. 10 passed
```

### 5.4 Generate Gas Report

```bash
forge test --gas-report
```

---

## 🚀 Step 6: Deploy Smart Contracts

### 6.1 Deploy to Lasna Testnet

```bash
make deploy-lasna
```

**Expected output:**
```
Deploying to Lasna testnet...
✓ WalletSwapMain deployed to: 0x...
✓ VirtualLiquidityPool deployed to: 0x...
✓ EulerLagrangeOrderProcessor deployed to: 0x...
✓ TrustWalletFeeDistributor deployed to: 0x...
✓ AssetVerifier deployed to: 0x...
✓ ReactiveHyperlaneBridge deployed to: 0x...
```

### 6.2 Save Contract Addresses

Create a file `DEPLOYED_ADDRESSES.md`:

```markdown
# Deployed Contract Addresses

## Lasna Testnet (Chain ID: 111)

- WalletSwapMain: 0x...
- VirtualLiquidityPool: 0x...
- EulerLagrangeOrderProcessor: 0x...
- TrustWalletFeeDistributor: 0x...
- AssetVerifier: 0x...
- ReactiveHyperlaneBridge: 0x...
```

### 6.3 Verify Contracts (Optional)

```bash
forge verify-contract <ADDRESS> <CONTRACT_NAME> --chain sepolia
```

---

## 🎨 Step 7: Setup Frontend

### 7.1 Navigate to Frontend

```bash
cd ../frontend
```

### 7.2 Install Dependencies

```bash
npm install
```

**If you encounter peer dependency warnings:**
```bash
npm install --legacy-peer-deps
```

### 7.3 Update Contract Addresses

Edit `src/config/contracts.ts`:

```typescript
export const CONTRACTS = {
  111: { // Lasna testnet
    walletSwapMain: '0x...', // From DEPLOYED_ADDRESSES.md
    virtualLiquidityPool: '0x...',
    orderProcessor: '0x...',
    feeDistributor: '0x...',
    assetVerifier: '0x...',
    bridge: '0x...',
  },
  // ... other chains
};
```

### 7.4 Verify Configuration

```bash
npm run type-check
```

---

## 🧪 Step 8: Test Frontend

### 8.1 Start Development Server

```bash
npm run dev
```

**Expected output:**
```
  VITE v5.4.21  ready in 300 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### 8.2 Open in Browser

1. Go to http://localhost:3000
2. You should see the Time-Validated Swap interface

### 8.3 Test Wallet Connection

1. Click "Connect Wallet"
2. MetaMask should prompt for connection
3. Select your account
4. Confirm connection

### 8.4 Test Swap Creation

1. Select "From" token (e.g., USDC)
2. Enter amount (e.g., 100)
3. Select "To" token (e.g., USDT)
4. Choose time validation (e.g., Medium)
5. Select target chain (e.g., Polygon Amoy)
6. Click "Create Order"
7. Confirm transaction in MetaMask

---

## ✅ Verification Checklist

### Contracts
- [ ] `forge build` completes without errors
- [ ] `forge test` passes all tests
- [ ] Contracts deploy successfully
- [ ] Contract addresses saved

### Frontend
- [ ] `npm install` completes without errors
- [ ] `npm run type-check` passes
- [ ] Dev server starts on http://localhost:3000
- [ ] Wallet connection works
- [ ] Contract addresses updated in config

### Integration
- [ ] Frontend connects to deployed contracts
- [ ] Wallet shows correct network
- [ ] Token balances display correctly
- [ ] Fee calculation works
- [ ] Orders can be created

---

## 🔍 Troubleshooting

### Node.js Issues

**npm command not found:**
```bash
# Reinstall Node.js
# macOS:
brew uninstall node
brew install node

# Ubuntu:
sudo apt-get remove nodejs npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Foundry Issues

**forge command not found:**
```bash
# Reinstall Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

**Build fails:**
```bash
# Clean and rebuild
rm -rf out/
forge build
```

### Contract Deployment Issues

**Insufficient funds:**
- Request more testnet funds from faucets
- Check balance: `cast balance <ADDRESS> --rpc-url <RPC_URL>`

**Invalid RPC URL:**
- Verify RPC URL is correct
- Test with: `cast call 0x0000000000000000000000000000000000000000 --rpc-url <RPC_URL>`

**Private key error:**
- Ensure private key is without 0x prefix
- Check .env file has correct format

### Frontend Issues

**npm install fails:**
```bash
npm install --legacy-peer-deps
```

**Port 3000 already in use:**
```bash
npm run dev -- --port 3001
```

**MetaMask connection fails:**
- Ensure MetaMask is installed
- Check browser console for errors
- Verify contract addresses in config

See **TROUBLESHOOTING.md** for more solutions.

---

## 📊 Network Configuration

### Sepolia Testnet
```
Network Name: Sepolia
RPC URL: https://sepolia.infura.io/v3/{KEY}
Chain ID: 11155111
Currency: ETH
Block Explorer: https://sepolia.etherscan.io
```

### Polygon Amoy
```
Network Name: Polygon Amoy
RPC URL: https://rpc-amoy.polygon.technology
Chain ID: 80002
Currency: MATIC
Block Explorer: https://amoy.polygonscan.com
```

### Reactive Network (Lasna)
```
Network Name: Reactive Network (Lasna)
RPC URL: https://rpc.lasna.reactive.network
Chain ID: 111
Currency: RVT
Block Explorer: https://lasna.reactscan.net
```

---

## 🎯 Next Steps

1. **Deploy to Production** - Follow DEPLOYMENT_GUIDE.md
2. **Monitor Contracts** - Check block explorers
3. **Test Swaps** - Create multiple test orders
4. **Optimize Gas** - Review gas reports
5. **Security Audit** - Consider professional audit

---

## 📞 Getting Help

### Documentation
- Read README.md for overview
- Check TROUBLESHOOTING.md for common issues
- Review INTEGRATION_GUIDE.md for integration details

### Resources
- Foundry: https://book.getfoundry.sh/
- Vite: https://vitejs.dev/
- ethers.js: https://docs.ethers.org/v6/
- Reactive Network: https://dev.reactive.network/

### Common Commands

```bash
# Check Node version
node --version

# Check npm version
npm --version

# Check Foundry version
forge --version

# Check git status
git status

# View contract balance
cast balance <ADDRESS> --rpc-url <RPC_URL>

# Get current gas price
cast gas-price --rpc-url <RPC_URL>
```

---

## ✨ You're Ready!

Once you've completed all steps:
1. Contracts are deployed and tested
2. Frontend is running and connected
3. Wallet integration is working
4. Ready to create swaps

**Congratulations! Your MVI DApp is ready to use.**

---

**Last Updated:** January 3, 2026  
**Version:** 1.0  
**Status:** Production Ready
