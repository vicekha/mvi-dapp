# Smart Contracts Deployment Guide

Complete guide for deploying MVI Reactive Network smart contracts to testnet and mainnet.

## Prerequisites

1. **Foundry Installation**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. **Private Keys**
- Sepolia testnet private key
- Polygon Amoy testnet private key
- Reactive Network (Kopli) testnet private key

3. **RPC Endpoints**
- Sepolia: https://sepolia.infura.io/v3/YOUR_KEY
- Polygon Amoy: https://rpc-amoy.polygon.technology
- Reactive: https://kopli.rpc.reactive.network

## Environment Setup

Create `.env` file:
```bash
# RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
REACTIVE_RPC_URL=https://kopli.rpc.reactive.network

# Private Keys (without 0x prefix)
SEPOLIA_PRIVATE_KEY=your_private_key_here
POLYGON_AMOY_PRIVATE_KEY=your_private_key_here
REACTIVE_PRIVATE_KEY=your_private_key_here

# Etherscan API Keys (for verification)
ETHERSCAN_API_KEY=your_etherscan_key
POLYGONSCAN_API_KEY=your_polygonscan_key
REACTIVE_SCAN_API_KEY=your_reactive_scan_key

# Deployment Configuration
TRUST_WALLET_ADDRESS=0x0000000000000000000000000000000000000000
HYPERLANE_MAILBOX=0x0000000000000000000000000000000000000000
BRIDGE_FEE_PERCENTAGE=50  # 0.5%
```

## Deployment Steps

### Step 1: Build Contracts
```bash
forge build
```

Verify no compilation errors.

### Step 2: Deploy to Sepolia (Origin Chain)

#### 2.1 Deploy VirtualLiquidityPool
```bash
forge create src/VirtualLiquidityPool.sol:VirtualLiquidityPool \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Save the address as `SEPOLIA_LIQUIDITY_POOL`**

#### 2.2 Deploy AssetVerifier
```bash
forge create src/AssetVerifier.sol:AssetVerifier \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Save the address as `SEPOLIA_ASSET_VERIFIER`**

#### 2.3 Deploy TrustWalletFeeDistributor
```bash
forge create src/TrustWalletFeeDistributor.sol:TrustWalletFeeDistributor \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --constructor-args $TRUST_WALLET_ADDRESS \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Save the address as `SEPOLIA_FEE_DISTRIBUTOR`**

#### 2.4 Deploy EulerLagrangeOrderProcessor
```bash
forge create src/EulerLagrangeOrderProcessor.sol:EulerLagrangeOrderProcessor \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --constructor-args $SEPOLIA_LIQUIDITY_POOL $SEPOLIA_FEE_DISTRIBUTOR $SEPOLIA_ASSET_VERIFIER \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Save the address as `SEPOLIA_ORDER_PROCESSOR`**

#### 2.5 Deploy WalletSwapMain
```bash
forge create src/WalletSwapMain.sol:WalletSwapMain \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --constructor-args $SEPOLIA_LIQUIDITY_POOL $SEPOLIA_ORDER_PROCESSOR $SEPOLIA_FEE_DISTRIBUTOR $SEPOLIA_ASSET_VERIFIER \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Save the address as `SEPOLIA_WALLET_SWAP_MAIN`**

### Step 3: Deploy to Polygon Amoy (Destination Chain)

Repeat Step 2 with `--rpc-url polygon_amoy` and save addresses with `POLYGON_` prefix.

### Step 4: Deploy to Reactive Network (Kopli Testnet)

#### 4.1 Deploy ReactiveHyperlaneBridge
```bash
forge create src/ReactiveHyperlaneBridge.sol:ReactiveHyperlaneBridge \
  --rpc-url reactive \
  --private-key $REACTIVE_PRIVATE_KEY \
  --constructor-args $HYPERLANE_MAILBOX $TRUST_WALLET_ADDRESS $BRIDGE_FEE_PERCENTAGE \
  --verify \
  --etherscan-api-key $REACTIVE_SCAN_API_KEY
```

**Save the address as `REACTIVE_BRIDGE`**

#### 4.2 Deploy VirtualLiquidityPool (on Reactive)
```bash
forge create src/VirtualLiquidityPool.sol:VirtualLiquidityPool \
  --rpc-url reactive \
  --private-key $REACTIVE_PRIVATE_KEY \
  --verify
```

**Save the address as `REACTIVE_LIQUIDITY_POOL`**

#### 4.3 Deploy other contracts on Reactive
Repeat for AssetVerifier, TrustWalletFeeDistributor, and EulerLagrangeOrderProcessor.

### Step 5: Configure Cross-Chain Connections

#### 5.1 Add Sepolia to Polygon Bridge
```bash
cast send $POLYGON_BRIDGE "addSupportedChain(uint256,uint32,address)" \
  11155111 \
  0 \
  $SEPOLIA_BRIDGE \
  --rpc-url polygon_amoy \
  --private-key $POLYGON_AMOY_PRIVATE_KEY
```

#### 5.2 Add Polygon to Sepolia Bridge
```bash
cast send $SEPOLIA_BRIDGE "addSupportedChain(uint256,uint32,address)" \
  80002 \
  0 \
  $POLYGON_BRIDGE \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY
```

### Step 6: Whitelist Tokens

#### 6.1 Whitelist USDC on Sepolia
```bash
cast send $SEPOLIA_ORDER_PROCESSOR "whitelistToken(address)" \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY
```

#### 6.2 Whitelist USDT on Polygon
```bash
cast send $POLYGON_ORDER_PROCESSOR "whitelistToken(address)" \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  --rpc-url polygon_amoy \
  --private-key $POLYGON_AMOY_PRIVATE_KEY
```

### Step 7: Add Supported Tokens to Bridge

#### 7.1 Add USDC to Sepolia Bridge
```bash
cast send $SEPOLIA_BRIDGE "addSupportedToken(address,string,string)" \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  "USD Coin" \
  "USDC" \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY
```

#### 7.2 Add USDT to Polygon Bridge
```bash
cast send $POLYGON_BRIDGE "addSupportedToken(address,string,string)" \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  "Tether USD" \
  "USDT" \
  --rpc-url polygon_amoy \
  --private-key $POLYGON_AMOY_PRIVATE_KEY
```

## Verification

### Verify Deployment
```bash
# Check VirtualLiquidityPool
cast call $SEPOLIA_LIQUIDITY_POOL "lambda()" --rpc-url sepolia

# Check OrderProcessor
cast call $SEPOLIA_ORDER_PROCESSOR "getOrderCount()" --rpc-url sepolia

# Check WalletSwapMain
cast call $SEPOLIA_WALLET_SWAP_MAIN "launchTimestamp()" --rpc-url sepolia
```

### Check Whitelisted Tokens
```bash
cast call $SEPOLIA_ORDER_PROCESSOR "whitelistedTokens(address)" \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  --rpc-url sepolia
```

## Testing Deployment

### 1. Create Test Order
```bash
# Approve USDC spending
cast send 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  "approve(address,uint256)" \
  $SEPOLIA_WALLET_SWAP_MAIN \
  1000000000 \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY

# Create order
cast send $SEPOLIA_WALLET_SWAP_MAIN \
  "createOrder(address,address,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint256)" \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 \
  1000000 \
  990000 \
  1000000000000000000 \
  990000000000000000 \
  10000000000000000 \
  3600 \
  true \
  0 \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY
```

### 2. Monitor Events
```bash
# Watch for OrderCreated events
cast logs \
  --address $SEPOLIA_WALLET_SWAP_MAIN \
  --topic "OrderInitiated(bytes32,address,address,address,uint256,uint256)" \
  --from-block latest \
  --rpc-url sepolia
```

## Troubleshooting

### Issue: Insufficient Balance
```
Error: Insufficient balance for gas
```
**Solution:** Ensure wallet has enough ETH for gas fees on each chain.

### Issue: Contract Verification Failed
```
Error: Contract verification failed
```
**Solution:** 
1. Wait 30 seconds after deployment
2. Check Etherscan API key
3. Verify contract code matches deployed bytecode

### Issue: Transaction Reverted
```
Error: Transaction reverted: function selector was not recognized
```
**Solution:** 
1. Check contract address is correct
2. Verify contract was deployed successfully
3. Check function parameters match expected types

## Mainnet Deployment

For mainnet deployment, follow the same steps but use:
- Mainnet RPC URLs
- Mainnet private keys
- Mainnet contract addresses for tokens
- Mainnet Hyperlane mailbox address

**WARNING:** Always test thoroughly on testnet before mainnet deployment.

## Post-Deployment Checklist

- [ ] All contracts deployed successfully
- [ ] Contracts verified on block explorers
- [ ] Cross-chain bridges configured
- [ ] Tokens whitelisted
- [ ] Test order created successfully
- [ ] Events emitted correctly
- [ ] Callbacks processed correctly
- [ ] Fee distribution working
- [ ] Asset verification functioning
- [ ] Liquidity pool initialized

## Monitoring

### Set Up Alerts
```bash
# Monitor OrderCreated events
cast logs \
  --address $SEPOLIA_WALLET_SWAP_MAIN \
  --topic "OrderInitiated(bytes32,address,address,address,uint256,uint256)" \
  --follow \
  --rpc-url sepolia
```

### Check System Health
```bash
# Get order count
cast call $SEPOLIA_ORDER_PROCESSOR "getOrderCount()" --rpc-url sepolia

# Get queue length
cast call $SEPOLIA_ORDER_PROCESSOR "getOrderQueueLength()" --rpc-url sepolia

# Get callback count
cast call $SEPOLIA_WALLET_SWAP_MAIN "getCallbackCount()" --rpc-url sepolia
```

## Upgrades

To upgrade a contract:

1. Deploy new version
2. Update component reference in WalletSwapMain
3. Verify functionality with test orders
4. Monitor for issues

```bash
cast send $SEPOLIA_WALLET_SWAP_MAIN \
  "updateComponents(address,address,address,address)" \
  $NEW_LIQUIDITY_POOL \
  $NEW_ORDER_PROCESSOR \
  $NEW_FEE_DISTRIBUTOR \
  $NEW_ASSET_VERIFIER \
  --rpc-url sepolia \
  --private-key $SEPOLIA_PRIVATE_KEY
```

## Support

For deployment issues:
1. Check this guide
2. Review contract documentation
3. Check Foundry documentation
4. Open an issue on GitHub
