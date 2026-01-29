# Lasna Testnet Deployment Guide

## Quick Start

### Prerequisites

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Clone and setup
cd mvi-reactive-contracts
cp .env.example .env
```

### Configuration

Edit `.env` with your values:

```bash
# Set your private key
export PRIVATE_KEY=your_private_key_without_0x

# Set trust wallet address
export TRUST_WALLET=0xyour_trust_wallet_address
```

### Deploy

```bash
# Build contracts
make build

# Run tests
make test

# Deploy to Lasna Testnet
make deploy-lasna
```

---

## Detailed Setup

### Step 1: Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify installation:
```bash
forge --version
cast --version
```

### Step 2: Clone Repository

```bash
git clone https://github.com/your-repo/mvi-reactive-contracts.git
cd mvi-reactive-contracts
```

### Step 3: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
nano .env
```

Required variables:
- `PRIVATE_KEY` - Your deployment wallet private key (without 0x)
- `TRUST_WALLET` - Address for fee collection

### Step 4: Install Dependencies

```bash
# Install OpenZeppelin contracts
forge install OpenZeppelin/openzeppelin-contracts

# Update dependencies
forge update
```

### Step 5: Build Contracts

```bash
forge build
```

Expected output:
```
Compiling 6 contracts...
✓ All contracts compiled successfully
```

### Step 6: Run Tests

```bash
# Run all tests
forge test -vv

# Run specific test
forge test -k testFeeCalculation -vv

# Generate gas report
forge test --gas-report
```

### Step 7: Deploy to Lasna

```bash
# Deploy using Makefile
make deploy-lasna

# Or deploy directly
forge script script/DeployLasna.s.sol:DeployLasnaScript \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vv
```

---

## Deployment Output

After successful deployment, you'll see:

```
╔════════════════════════════════════════════════════════════╗
║           DEPLOYMENT SUMMARY - LASNA TESTNET               ║
╚════════════════════════════════════════════════════════════╝

CORE CONTRACTS:
  VirtualLiquidityPool:       0x1234...
  OrderProcessor:             0x5678...
  FeeDistributor:             0x9abc...
  AssetVerifier:              0xdef0...

MAIN CONTRACTS:
  WalletSwapMain:             0x1111...
  ReactiveHyperlaneBridge:    0x2222...

CONFIGURATION:
  Trust Wallet:               0x3333...
  Deployer:                   0x4444...

NEXT STEPS:
  1. Fund WalletSwapMain with REACT for gas fees
  2. Register test tokens in fee distributor
  3. Test order creation and execution
  4. Monitor debt coverage
```

---

## Post-Deployment Setup

### 1. Fund Contract with REACT

```bash
# Get contract balance
cast balance $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network

# Send REACT to contract (requires testnet faucet)
cast send $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY \
  --value 1ether
```

### 2. Register Test Tokens

```bash
# Register token with fee distributor
cast send $FEE_DISTRIBUTOR_ADDR \
  "setTrustWalletAddress(address,address)" \
  0x_test_token_address \
  $TRUST_WALLET \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY
```

### 3. Test Order Creation

```bash
# Create a test order
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

---

## Network Information

### Lasna Testnet Details

| Property | Value |
|----------|-------|
| Network Name | Reactive Network (Lasna Testnet) |
| Chain ID | 111 |
| RPC URL | https://rpc.lasna.reactive.network |
| Explorer | https://lasna.reactscan.net |
| Currency | REACT |
| Block Time | ~2 seconds |

### System Contract

```
Address: 0x0000000000000000000000000000000000fffFfF
Purpose: Handles RVM transactions and callbacks
```

### Important Addresses

```
VirtualLiquidityPool:        Manages liquidity
OrderProcessor:              Processes orders
FeeDistributor:              Collects and distributes fees
AssetVerifier:               Verifies token ownership
WalletSwapMain:              Main orchestrator
ReactiveHyperlaneBridge:     Cross-chain bridge
```

---

## Testing

### Run All Tests

```bash
forge test -vv
```

### Run Specific Test Suite

```bash
# Fee calculation tests
forge test -k "Fee" -vv

# Debt coverage tests
forge test -k "Debt" -vv

# Integration tests
forge test -k "Integration" -vv
```

### Gas Report

```bash
forge test --gas-report
```

### Test Coverage

```bash
forge coverage
```

---

## Troubleshooting

### Issue: "Private key not set"

**Solution:**
```bash
export PRIVATE_KEY=your_key_without_0x
```

### Issue: "RPC connection failed"

**Solution:**
```bash
# Test RPC connection
curl https://rpc.lasna.reactive.network \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

### Issue: "Insufficient gas"

**Solution:**
```bash
# Get testnet REACT from faucet
# Visit: https://faucet.lasna.reactive.network

# Or send from another account
cast send $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY \
  --value 1ether
```

### Issue: "Contract already deployed"

**Solution:**
```bash
# Use different deployer address
# Or verify on Etherscan first
```

### Issue: "Compilation errors"

**Solution:**
```bash
# Clean and rebuild
make clean
make build

# Check Solidity version
solc --version
```

---

## Verification

### Verify Deployment

```bash
# Check contract code
cast code $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network

# Check contract balance
cast balance $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network

# Check contract owner
cast call $WALLET_SWAP_MAIN_ADDR \
  "owner()(address)" \
  --rpc-url https://rpc.lasna.reactive.network
```

### View on Explorer

Visit: https://lasna.reactscan.net

Search for your contract address to view:
- Contract code
- Transactions
- Events
- State variables

---

## Advanced Usage

### Deploy with Custom Parameters

```bash
# Create custom deployment script
cp script/DeployLasna.s.sol script/DeployCustom.s.sol

# Edit script with custom parameters
nano script/DeployCustom.s.sol

# Deploy
forge script script/DeployCustom.s.sol:DeployCustomScript \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### Interact with Deployed Contract

```bash
# Call view function
cast call $WALLET_SWAP_MAIN_ADDR \
  "getDebtStatus()(uint256,uint256,bool)" \
  --rpc-url https://rpc.lasna.reactive.network

# Send transaction
cast send $WALLET_SWAP_MAIN_ADDR \
  "manualCoverDebt()" \
  --rpc-url https://rpc.lasna.reactive.network \
  --private-key $PRIVATE_KEY
```

### Monitor Events

```bash
# Watch for events
cast logs \
  --address $WALLET_SWAP_MAIN_ADDR \
  --rpc-url https://rpc.lasna.reactive.network
```

---

## Best Practices

1. **Always test locally first**
   ```bash
   forge test -vv
   ```

2. **Use environment variables**
   ```bash
   export PRIVATE_KEY=...
   export TRUST_WALLET=...
   ```

3. **Verify contracts on explorer**
   - Visit https://lasna.reactscan.net
   - Search for contract address
   - Verify source code

4. **Monitor gas usage**
   ```bash
   forge test --gas-report
   ```

5. **Keep backups**
   - Backup private keys securely
   - Save deployment addresses
   - Document configuration

6. **Update dependencies regularly**
   ```bash
   forge update
   ```

---

## Support

### Resources

- **Reactive Network Docs**: https://dev.reactive.network
- **Foundry Book**: https://book.getfoundry.sh
- **OpenZeppelin Docs**: https://docs.openzeppelin.com
- **Lasna Explorer**: https://lasna.reactscan.net

### Getting Help

1. Check the troubleshooting section
2. Review contract documentation
3. Check Reactive Network documentation
4. Open an issue on GitHub

---

## Next Steps

After successful deployment:

1. ✅ Deploy contracts to Lasna
2. ✅ Fund with REACT
3. ✅ Register test tokens
4. ✅ Create test orders
5. ✅ Monitor debt coverage
6. ✅ Test cross-chain callbacks
7. ✅ Verify on explorer
8. Deploy to mainnet (when ready)

---

## Quick Reference

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

# Setup help
make setup
```

---

## Contract Addresses (Example)

After deployment, save these addresses:

```
VirtualLiquidityPool:      0x...
OrderProcessor:            0x...
FeeDistributor:            0x...
AssetVerifier:             0x...
WalletSwapMain:            0x...
ReactiveHyperlaneBridge:   0x...
```

Store in `.env` for future reference:

```bash
VIRTUAL_LIQUIDITY_POOL=0x...
EULER_LAGRANGE_ORDER_PROCESSOR=0x...
TRUST_WALLET_FEE_DISTRIBUTOR=0x...
ASSET_VERIFIER=0x...
WALLET_SWAP_MAIN=0x...
REACTIVE_HYPERPLANE_BRIDGE=0x...
```
