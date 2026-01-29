# MVI Reactive Contracts - Quick Start Testnet Deployment

## 5-Minute Setup

### Prerequisites
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
```

### Step 1: Clone & Setup (1 min)
```bash
cd mvi-reactive-contracts
cp .env.example .env
```

### Step 2: Configure Environment (1 min)
Edit `.env`:
```bash
PRIVATE_KEY=your_private_key_without_0x
TRUST_WALLET=0xyour_trust_wallet_address
```

### Step 3: Build & Test (2 min)
```bash
# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts

# Build
forge build

# Run tests
forge test -vv
```

### Step 4: Deploy to Lasna Testnet (1 min)
```bash
make deploy-lasna
```

## What Gets Deployed

| Contract | Purpose |
|----------|---------|
| VirtualLiquidityPool | Liquidity management |
| EulerLagrangeOrderProcessor | Order processing |
| TrustWalletFeeDistributor | Fee collection & debt coverage |
| AssetVerifier | Token verification |
| WalletSwapMain | Main orchestrator |
| ReactiveHyperlaneBridge | Cross-chain bridging |

## Expected Output

```
╔════════════════════════════════════════════════════════════╗
║           DEPLOYMENT SUMMARY - LASNA TESTNET               ║
╚════════════════════════════════════════════════════════════╝

CORE CONTRACTS:
  VirtualLiquidityPool:      0x...
  OrderProcessor:            0x...
  FeeDistributor:            0x...
  AssetVerifier:             0x...

MAIN CONTRACTS:
  WalletSwapMain:            0x...
  ReactiveHyperlaneBridge:   0x...

CONFIGURATION:
  Trust Wallet:              0x...
  Deployer:                  0x...
```

## Post-Deployment

### 1. Fund Contract with REACT
```bash
# Get testnet REACT from faucet
# https://faucet.lasna.reactive.network

# Send to WalletSwapMain
cast send $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY \
  --value 1ether
```

### 2. Register Test Tokens
```bash
# Whitelist token in order processor
cast send $ORDER_PROCESSOR_ADDR \
  "whitelistToken(address)" \
  0x_test_token_address \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY
```

### 3. Test Order Creation
```bash
# Create test order
cast send $WALLET_SWAP_MAIN_ADDR \
  "createOrder(address,address,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256)" \
  0x_token_in \
  0x_token_out \
  100000000000000000 \
  100000000000000000 \
  100000000000000000 \
  100000000000000000 \
  9900 \
  3600 \
  true \
  0 \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY
```

### 4. Monitor Debt Coverage
```bash
# Check debt status
cast call $WALLET_SWAP_MAIN_ADDR \
  "getDebtStatus()(uint256,uint256,bool)" \
  --rpc-url https://rpc.lasna.reactive.network

# Check accumulated fees
cast call $FEE_DISTRIBUTOR_ADDR \
  "getAccumulatedFees(address)" \
  0x0000000000000000000000000000000000000000 \
  --rpc-url https://rpc.lasna.reactive.network
```

## Network Information

| Property | Value |
|----------|-------|
| Network | Reactive Network (Lasna Testnet) |
| Chain ID | 111 |
| RPC URL | https://rpc.lasna.reactive.network |
| Explorer | https://lasna.reactscan.net |
| Currency | REACT |
| System Contract | 0x0000000000000000000000000000000000fffFfF |

## Troubleshooting

### Issue: "Private key not set"
```bash
export PRIVATE_KEY=your_key_without_0x
```

### Issue: "RPC connection failed"
```bash
# Test RPC
curl https://rpc.lasna.reactive.network \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### Issue: "Insufficient gas"
```bash
# Get testnet REACT from faucet
# https://faucet.lasna.reactive.network
```

## Useful Commands

```bash
# Build
make build

# Test
make test

# Deploy
make deploy-lasna

# Clean
make clean

# Gas report
make gas-report

# Check info
make info
```

## Verify Deployment

Visit: https://lasna.reactscan.net

Search for your contract addresses to view:
- Contract code
- Transactions
- Events
- State variables

## Next Steps

1. ✅ Deploy contracts
2. ✅ Fund with REACT
3. ✅ Register test tokens
4. ✅ Create test orders
5. ✅ Monitor debt coverage
6. ✅ Test cross-chain callbacks
7. ✅ Verify on explorer
8. Deploy to mainnet (when ready)

## Support

- **Reactive Network Docs**: https://dev.reactive.network
- **Foundry Book**: https://book.getfoundry.sh
- **Lasna Explorer**: https://lasna.reactscan.net

## Quick Reference

```bash
# One-line deployment
make deploy-lasna

# Check status
cast call $WALLET_SWAP_MAIN_ADDR "getDebtStatus()(uint256,uint256,bool)" --rpc-url https://rpc.lasna.reactive.network

# View on explorer
# https://lasna.reactscan.net/address/0x...
```

---

**Ready to deploy? Run: `make deploy-lasna`**
