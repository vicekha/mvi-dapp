# MVI DApp Smart Contract Audit Package

## Overview

This package contains the core smart contracts for the **Minutes Value Index (MVI) Decentralized Application** - a peer-to-peer asset exchange platform built on the **Reactive Network** that enables instant on-chain matching and cross-chain settlement.

## Contract Summary

| Contract | Lines of Code | Description |
|----------|---------------|-------------|
| WalletSwapMain.sol | ~386 | Main entry point for creating/fulfilling orders |
| EulerLagrangeOrderProcessor.sol | ~606 | Order lifecycle management and matching logic |
| TrustWalletFeeDistributor.sol | ~391 | Fee collection and distribution |
| VirtualLiquidityPool.sol | ~244 | Virtual liquidity tracking with lambda decay |
| AssetVerifier.sol | ~254 | Token/NFT ownership verification |
| SwapMatcherRSCv3.sol | ~170 | Reactive Smart Contract for cross-chain matching |

**Total: ~2,051 lines of Solidity code**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         USER                                 │
│            Creates orders, approves tokens                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    WalletSwapMain.sol                        │
│  - createOrder()      - fulfillOrder()                       │
│  - cancelOrder()      - executeInterChainOrder()             │
│  - Instant matching via orderProcessor.findMatchingOrder()   │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────────────┐
│ OrderProcessor│ │FeeDistributor │ │  VirtualLiquidityPool     │
│               │ │               │ │  & AssetVerifier          │
│ - Orders CRUD │ │ - Fee calc    │ │  - Liquidity tracking     │
│ - Matching    │ │ - Distribution│ │  - Asset verification     │
│ - Expiration  │ │ - Debt cover  │ │  - Price signals          │
└───────┬───────┘ └───────────────┘ └───────────────────────────┘
        │
        │ Cross-chain events
        ▼
┌─────────────────────────────────────────────────────────────┐
│                  SwapMatcherRSCv3.sol                        │
│  (Reactive Smart Contract - Lives on Reactive Network)      │
│  - Monitors OrderInitiated events from multiple chains       │
│  - Matches compatible orders across chains                   │
│  - Emits callbacks to execute settlements                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Contract Details

### 1. WalletSwapMain.sol

**Purpose**: Main entry point for users to interact with the swap system.

**Key Functions**:
| Function | Visibility | Description |
|----------|------------|-------------|
| `createOrder(...)` | external payable | Creates a new swap order, collects fees, attempts instant matching |
| `fulfillOrder(orderId)` | external payable | Direct order fulfillment by taker |
| `cancelOrder(orderId)` | external | Cancels an order and refunds maker |
| `executeInterChainOrder(rvmId, orderId, beneficiary)` | external | Cross-chain settlement callback (RSC-only) |
| `setAuthorizedReactiveVM(address)` | external onlyOwner | Sets authorized RSC address |
| `setCallbackProxy(address)` | external onlyOwner | Sets callback proxy |

**Security Considerations**:
- Uses `ReentrancyGuard` for all state-changing functions
- Authorization checks for cross-chain callbacks
- Handles both ERC20, ERC721, and native ETH

---

### 2. EulerLagrangeOrderProcessor.sol

**Purpose**: Core order management, lifecycle, and matching logic.

**Key Functions**:
| Function | Visibility | Description |
|----------|------------|-------------|
| `createOrder(...)` | external | Creates order with full validation |
| `findMatchingOrder(tokenIn, tokenOut, amountIn, amountOut)` | external view | Finds compatible counter-party order |
| `updateOrderStatus(orderId, status)` | external | Updates order status (authorized callers) |
| `cancelOrder(orderId)` | external | Cancels order with refund logic |
| `expireOrders()` | external | Batch expires and processes stale orders |

**Matching Algorithm**:
- Orders indexed in `ordersByPair[tokenIn][tokenOut]` for O(n) lookup
- Supports partial fills for fungible tokens
- NFT orders require exact tokenId matches
- Cross-chain targeting via `targetChainId`

**Order Status Flow**:
```
ACTIVE → PARTIALLY_FILLED → FILLED
   │           │
   └──→ CANCELLED ←──┘
           │
           ▼
        EXPIRED
```

---

### 3. TrustWalletFeeDistributor.sol

**Purpose**: Fee calculation, collection, and distribution to trust wallet.

**Key Functions**:
| Function | Visibility | Description |
|----------|------------|-------------|
| `calculateFee(token, type, amount, minutesValue)` | external view | Calculates fee based on asset type |
| `distributeFee(...)` | external payable | Receives and distributes fees |
| `withdrawFees(token)` | external onlyOwner | Withdraws accumulated fees |
| `coverReactiveDebt(contract, token)` | external | Covers RSC gas debt from fees |

**Fee Structure**:
- ERC20/Native: 1% of transaction value
- ERC721 (NFT): 100 basis point base fee
- Caps at 10,000 units

---

### 4. VirtualLiquidityPool.sol

**Purpose**: Virtual liquidity tracking for price discovery and market making signals.

**Key Functions**:
| Function | Visibility | Description |
|----------|------------|-------------|
| `addLiquidity(tokenA, tokenB, amount)` | external | Records liquidity provision |
| `removeLiquidity(tokenA, tokenB, amount)` | external | Removes liquidity |
| `getLiquidity(tokenA, tokenB)` | external view | Returns current liquidity |
| `getImpliedPrice(tokenA, tokenB)` | external view | Price based on liquidity ratio |

**Special Features**:
- Lambda decay factor (0.5 ETH default) for price smoothing
- Circular buffer for historical price data
- No actual token escrow - purely virtual tracking

---

### 5. AssetVerifier.sol

**Purpose**: Verifies user ownership and balances before order creation.

**Key Functions**:
| Function | Visibility | Description |
|----------|------------|-------------|
| `verifyToken(token, owner, amount)` | external | Verifies ERC20 balance |
| `verifyNft(token, owner, tokenId)` | external | Verifies ERC721 ownership |
| `checkVerification(verificationId)` | external view | Checks if verification is still valid |
| `invalidateVerification(verificationId)` | external | Invalidates a verification |

---

### 6. SwapMatcherRSCv3.sol (Reactive Smart Contract)

**Purpose**: Cross-chain order monitoring and matching via Reactive Network.

**Key Functions**:
| Function | Visibility | Description |
|----------|------------|-------------|
| `react(LogRecord calldata log)` | external vmOnly | Processes events (VM-only) |
| `manualSubscribe(chainId, contract)` | external onlyOwner | Subscribes to chain events |

**Cross-Chain Flow**:
1. RSC subscribes to `OrderInitiated` events on multiple chains
2. When event received, checks for matching orders in internal storage
3. If match found, emits `Callback` event to both chains
4. Settlement executed via `WalletSwapMain.executeInterChainOrder()`

---

## Deployed Addresses

### Lasna Testnet (Chain ID: 5318007)
| Contract | Address |
|----------|---------|
| WalletSwapMain | `0x1fd82a0cb28f46414f887ca610d3f753caf3de0b` |
| OrderProcessor | `0x98bd04bbfb691831e9a3117052b39eb416e95ff0` |
| FeeDistributor | `0x570a4f7862a3061128f478ff20a1ad91dd8b1e0e` |
| AssetVerifier | `0xbd5080a56c68b7da26bf252696a6e404752cf4a1` |
| VirtualLiquidityPool | `0xf4a8a4c28e8341ff9a95b8622f35c945dc877e50` |

### Sepolia Testnet (Chain ID: 11155111)
| Contract | Address |
|----------|---------|
| WalletSwapMain | `0xb8489abc7f5df9add04579bb74ec3c958d59ee21` |
| OrderProcessor | `0x3c85d9903327d6b2290ce8493e5e7e1f9c06f52d` |
| FeeDistributor | `0x9d04018fe3e41d8283231527b10fff66fe3f2020` |
| AssetVerifier | `0xe6f6fa8a2eb90b3c30f59334d6947d0f119fb4af` |

---

## Security Considerations

### Access Control
- **Ownable**: Administrative functions protected
- **ReentrancyGuard**: All value transfers protected
- **vmOnly (RSC)**: Only Reactive VM can call react()
- **Authorized Callbacks**: Only registered RSC can execute cross-chain settlements

### Attack Vectors to Review
1. **Reentrancy**: All external calls are made at the end of functions
2. **Front-running**: Order matching is deterministic but priority-based
3. **Price manipulation**: Virtual liquidity pool uses decay factor
4. **Cross-chain replay**: Orders are chain-specific with targetChainId
5. **Authorization bypass**: Check callback proxy and RVM authorization logic

### External Dependencies
- OpenZeppelin Contracts v4.x (Ownable, ReentrancyGuard, SafeERC20)
- Reactive Network Library (IReactive, AbstractReactive, ISystemContract)

---

## Building & Testing

```bash
# Install dependencies
forge install

# Build contracts
forge build

# Run tests
forge test -vv

# Run specific test file
forge test --match-path test/PartialFillTest.t.sol -vvv
```

---

## Contact

For questions during the audit, contact the development team.

---

*Last Updated: 2026-01-28*
