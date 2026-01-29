# MVI Reactive Network Smart Contracts

Reactive Network-compliant smart contracts for the Micro Venture Initiative (MVI) DApp - a non-custodial wallet-to-wallet token swap system with cross-chain capabilities.

## Overview

This repository contains 7 production-ready smart contracts that implement a sophisticated, event-driven token swap system powered by Reactive Network. The system enables users to swap tokens across chains while contributing to impact projects.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      WalletSwapMain (Orchestrator)              │
│                    - Order creation & management                │
│                    - Cross-chain callback tracking              │
└──────────┬──────────────────────────────────────────────────────┘
           │
    ┌──────┴──────┬──────────────┬──────────────┐
    │             │              │              │
┌───▼────┐  ┌────▼─────┐  ┌─────▼──┐  ┌──────▼──────┐
│Virtual │  │Euler-    │  │Trust   │  │Asset        │
│Liquidity│  │Lagrange  │  │Wallet  │  │Verifier     │
│Pool    │  │Order     │  │Fee     │  │             │
│        │  │Processor │  │Dist.   │  │             │
└────────┘  └──────────┘  └────────┘  └─────────────┘

┌──────────────────────────────────────────────────────────────────┐
│            ReactiveHyperlaneBridge (Cross-Chain)                 │
│           - Hyperlane integration for token bridging             │
│           - Multi-chain support (Sepolia, Polygon, etc)          │
└──────────────────────────────────────────────────────────────────┘
```

## Smart Contracts

### 1. **VirtualLiquidityPool.sol**
Manages virtual liquidity for time-based token valuations using Euler-Lagrange optimization.

**Key Features:**
- Virtual liquidity tracking per token pair
- Liquidity history for rate calculations
- Adaptive fill amount calculation
- Lambda parameter for smoothness control

**Events:**
- `LiquidityChanged` - Emitted when liquidity is updated
- `OptimalFillCalculated` - Emitted when fill amount is calculated

### 2. **EulerLagrangeOrderProcessor.sol**
Processes orders using Euler-Lagrange optimization for time-based valuation.

**Key Features:**
- Order creation and tracking
- Priority-based order queue (smallest first)
- Automatic rebooking for unfilled orders
- Token whitelist management
- Monthly volume tracking

**Events:**
- `OrderCreated` - New order created
- `OrderFilled` - Order fully executed
- `OrderPartiallyFilled` - Partial execution
- `OrderCancelled` - Order cancelled
- `OrderExpired` - Order expired
- `OrderRebooked` - Order rebooked
- `CrossChainOrderCreated` - Cross-chain order initiated

### 3. **TrustWalletFeeDistributor.sol**
Handles fee collection and distribution to Trust Wallet addresses.

**Key Features:**
- 1% fee rate on all swaps
- Per-token Trust Wallet address configuration
- Default Trust Wallet for unmapped tokens
- Minimum fee protection
- Fee history tracking

**Events:**
- `FeeDistributed` - Fee collected and distributed
- `TrustWalletAddressSet` - Wallet address configured

### 4. **AssetVerifier.sol**
Verifies token and NFT ownership before order creation.

**Key Features:**
- ERC20 token balance verification
- ERC721 NFT ownership verification
- Active verification tracking
- Verification status checking

**Events:**
- `VerificationStarted` - Verification initiated
- `VerificationEnded` - Verification completed
- `AssetMoved` - Asset transfer detected

### 5. **WalletSwapMain.sol**
Main orchestrator contract for the swap system.

**Key Features:**
- Order creation with cross-chain support
- Cross-chain callback management
- Component contract coordination
- Volume-based token removal (after 2 years)
- Callback execution tracking

**Events:**
- `OrderInitiated` - Order created
- `OrderExecuted` - Order executed
- `CrossChainCallbackCreated` - Callback registered
- `CrossChainCallbackExecuted` - Callback executed

### 6. **ReactiveHyperlaneBridge.sol**
Cross-chain bridge using Hyperlane and Reactive Network.

**Key Features:**
- Hyperlane mailbox integration
- Multi-chain token bridging
- Supported chain management
- Token whitelist
- Bridge fee collection
- Transfer tracking

**Events:**
- `TokenBridgeInitiated` - Bridge transfer started
- `TokenBridgeCompleted` - Bridge transfer completed
- `BridgeFeeCollected` - Fee collected

### 7. **RebookingLogic** (Integrated in OrderProcessor)
Automatic rebooking for unfilled orders based on order size.

**Features:**
- Threshold-based rebooking (90% for large, 10% for mega orders)
- Maximum 3 rebook attempts
- Dynamic expiration extension
- Stale order cleanup

## Reactive Network Compliance

All contracts are fully compliant with Reactive Network's event-driven architecture:

### Event Subscriptions
- Contracts emit events for all critical state changes
- Events are indexed for efficient filtering
- Cross-chain events trigger callbacks automatically

### Callback Handling
- `executeCallback()` in WalletSwapMain processes cross-chain results
- Proper error handling and timeout management
- Gas-efficient callback execution

### System Contract Integration
- Ready for Reactive System Contract integration
- Event listening infrastructure in place
- Callback coordination mechanisms

## Deployment

### Prerequisites
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
forge install
```

### Environment Variables
Create a `.env` file:
```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
REACTIVE_RPC_URL=https://kopli.rpc.reactive.network

SEPOLIA_PRIVATE_KEY=your_private_key
POLYGON_AMOY_PRIVATE_KEY=your_private_key
REACTIVE_PRIVATE_KEY=your_private_key

ETHERSCAN_API_KEY=your_etherscan_key
POLYGONSCAN_API_KEY=your_polygonscan_key
```

### Build
```bash
forge build
```

### Test
```bash
forge test
forge test --gas-report
forge coverage
```

### Deploy

#### 1. Deploy to Sepolia (Origin Chain)
```bash
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
```

#### 2. Deploy to Polygon Amoy (Destination Chain)
```bash
forge script script/Deploy.s.sol --rpc-url polygon_amoy --broadcast --verify
```

#### 3. Deploy to Reactive Network (Kopli Testnet)
```bash
forge script script/Deploy.s.sol --rpc-url reactive --broadcast --verify
```

## Contract Interactions

### Create a Swap Order
```solidity
// 1. Approve token spending
IERC20(tokenIn).approve(address(walletSwapMain), amountIn);

// 2. Create order
bytes32 orderId = walletSwapMain.createOrder(
    tokenIn,           // USDC on Sepolia
    tokenOut,          // USDT on Sepolia
    amountIn,          // 100 * 10^6 (100 USDC)
    amountOut,         // 99 * 10^6 (99 USDT)
    minutesValueIn,    // 100 * 10^18
    minutesValueOut,   // 99 * 10^18
    slippageTolerance, // 1 * 10^18 (1%)
    duration,          // 3600 (1 hour)
    enableRebooking,   // true
    targetChainId      // 0 for same-chain, 80002 for Polygon Amoy
);
```

### Cross-Chain Swap
```solidity
// Create order with targetChainId = 80002 (Polygon Amoy)
bytes32 orderId = walletSwapMain.createOrder(
    USDC_SEPOLIA,
    USDT_POLYGON,
    100 * 10^6,
    99 * 10^6,
    100 * 10^18,
    99 * 10^18,
    1 * 10^18,
    3600,
    true,
    80002  // Polygon Amoy
);

// Reactive Network will:
// 1. Listen for OrderCreated event on Sepolia
// 2. Trigger callback on Reactive Network
// 3. Execute callback on Polygon Amoy
// 4. Transfer tokens to recipient
```

## Fee Structure

- **Swap Fee**: 1% on all orders
- **Bridge Fee**: Configurable (default 0.5%)
- **Minimum Fee**: 1 minute (1 USDS equivalent)

Example for 100 USDC swap:
```
Input: 100 USDC
Swap Fee (1%): 1 USDC
Amount Out: 99 USDC (or equivalent)
```

## Testing

### Run All Tests
```bash
forge test
```

### Run Specific Test
```bash
forge test --match-contract VirtualLiquidityPool
```

### Run with Gas Report
```bash
forge test --gas-report
```

### Coverage Report
```bash
forge coverage
```

## Security Considerations

1. **Reentrancy Protection**: All state-changing functions use `nonReentrant`
2. **Access Control**: Critical functions protected with `onlyOwner`
3. **Input Validation**: All parameters validated before processing
4. **Safe ERC20**: Using SafeERC20 for token transfers
5. **Event Logging**: All critical actions emit events for monitoring

## Gas Optimization

- Order queue uses priority-based insertion (O(n) but typically small)
- Liquidity history limited to 10 entries
- Efficient verification tracking with array indexing
- Minimal storage operations in hot paths

## Monitoring & Maintenance

### Monitor Orders
```solidity
// Get order details
Order memory order = orderProcessor.getOrder(orderId);

// Check order status
if (order.status == OrderStatus.FILLED) {
    // Order completed
}

// Get order queue length
uint256 queueLength = orderProcessor.getOrderQueueLength();
```

### Monitor Callbacks
```solidity
// Get callback details
CrossChainCallback memory callback = walletSwapMain.getCallback(callbackId);

// Check if executed
if (callback.executed) {
    // Callback completed
}

// Get callback count
uint256 callbackCount = walletSwapMain.getCallbackCount();
```

## Upgrades & Maintenance

The system supports component upgrades through `updateComponents()`:

```solidity
walletSwapMain.updateComponents(
    newLiquidityPool,
    newOrderProcessor,
    newFeeDistributor,
    newAssetVerifier
);
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For questions or issues:
1. Check the documentation
2. Review test files for usage examples
3. Open an issue on GitHub

## Roadmap

- [ ] Reactive Network System Contract integration
- [ ] Advanced oracle integration for better pricing
- [ ] DAO governance for fee adjustments
- [ ] NFT-based impact certificates
- [ ] Advanced liquidity pooling mechanisms
- [ ] Automated market maker (AMM) integration

## Changelog

### v1.0.0 (Current)
- Initial release
- 7 core smart contracts
- Reactive Network compliance
- Hyperlane bridge integration
- Euler-Lagrange optimization
- Automatic rebooking system
