# Reactive Network Integration Guide

Complete guide for integrating MVI smart contracts with Reactive Network's event-driven architecture.

## Overview

Reactive Network enables smart contracts to subscribe to events from other blockchains and automatically trigger callbacks. The MVI DApp uses this to:

1. **Listen for OrderCreated events** on origin chains (Sepolia, Polygon)
2. **Process orders** on Reactive Network
3. **Execute callbacks** on destination chains
4. **Transfer tokens** to users non-custodially

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Origin Chain (Sepolia)                        │
│                                                                   │
│  User creates order → OrderCreated event emitted                │
│                                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Event subscription
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              Reactive Network (Kopli Testnet)                    │
│                                                                   │
│  1. Listen for OrderCreated event                               │
│  2. Verify order validity                                        │
│  3. Calculate optimal fill using Euler-Lagrange                 │
│  4. Trigger callback on destination chain                       │
│                                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Callback execution
                         │
┌────────────────────────▼────────────────────────────────────────┐
│              Destination Chain (Polygon Amoy)                    │
│                                                                   │
│  executeCallback() called → Tokens transferred to user          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Event Subscription System

### 1. Event Emission

All critical events are emitted with proper indexing:

```solidity
// VirtualLiquidityPool.sol
event LiquidityChanged(
    address indexed token0,
    address indexed token1,
    uint256 newLiquidity,
    uint256 timestamp
);

// EulerLagrangeOrderProcessor.sol
event OrderCreated(
    bytes32 indexed orderId,
    address indexed maker,
    address indexed tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minutesValueIn,
    uint256 timestamp
);

event CrossChainOrderCreated(
    bytes32 indexed orderId,
    uint256 targetChainId,
    uint256 timestamp
);

// WalletSwapMain.sol
event CrossChainCallbackCreated(
    bytes32 indexed callbackId,
    bytes32 indexed orderId,
    uint256 targetChainId,
    uint256 timestamp
);
```

### 2. Event Topics

For Reactive Network subscriptions, use these topics:

**OrderCreated Event:**
- Topic 0: `keccak256("OrderCreated(bytes32,address,address,address,uint256,uint256,uint256)")`
- Topic 1: orderId (indexed)
- Topic 2: maker (indexed)
- Topic 3: tokenIn (indexed)

**CrossChainOrderCreated Event:**
- Topic 0: `keccak256("CrossChainOrderCreated(bytes32,uint256,uint256)")`
- Topic 1: orderId (indexed)

### 3. Subscription Setup

In Reactive Network contracts, subscribe to events:

```solidity
// Subscribe to OrderCreated events
function subscribeToOrders(
    uint256 sourceChainId,
    address orderProcessorAddress
) external {
    // Topic 0: OrderCreated event signature
    uint256 topic0 = uint256(
        keccak256("OrderCreated(bytes32,address,address,address,uint256,uint256,uint256)")
    );
    
    // Subscribe via Reactive System Contract
    (bool success, ) = SYSTEM_CONTRACT.call(
        abi.encodeWithSignature(
            "subscribe(uint256,address,uint256,uint256,uint256,uint256)",
            sourceChainId,
            orderProcessorAddress,
            topic0,
            REACTIVE_IGNORE,  // Any maker
            REACTIVE_IGNORE,  // Any tokenIn
            REACTIVE_IGNORE   // Any tokenOut
        )
    );
    require(success, "Subscription failed");
}
```

## Callback Handling

### 1. Callback Structure

Callbacks are triggered when subscribed events occur:

```solidity
struct Callback {
    bytes32 orderId;
    address maker;
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint256 amountOut;
    uint256 minutesValueIn;
    uint256 targetChainId;
    uint256 timestamp;
}
```

### 2. Callback Execution

The `executeCallback()` function in WalletSwapMain processes callbacks:

```solidity
function executeCallback(bytes32 callbackId) external nonReentrant {
    CrossChainCallback storage callback = callbacks[callbackId];
    require(!callback.executed, "Callback already executed");
    require(callback.tokenOut != address(0), "Invalid callback");
    
    // Mark as executed
    callback.executed = true;
    
    // Transfer tokens to recipient
    IERC20(callback.tokenOut).safeTransfer(
        callback.recipient,
        callback.amountOut
    );
    
    emit CrossChainCallbackExecuted(
        callbackId,
        callback.orderId,
        callback.amountOut,
        block.timestamp
    );
}
```

### 3. Callback Coordination

For cross-chain swaps:

1. **Origin Chain (Sepolia):**
   - User creates order
   - OrderCreated event emitted
   - Tokens locked in contract

2. **Reactive Network:**
   - Event detected
   - Order verified
   - Callback created
   - Callback ID stored

3. **Destination Chain (Polygon):**
   - executeCallback() called
   - Tokens transferred to user
   - Event emitted

## Event Flow Example

### Scenario: Swap USDC on Sepolia for USDT on Polygon

```
1. User calls createOrder():
   - tokenIn: USDC (Sepolia)
   - tokenOut: USDT (Polygon)
   - amountIn: 100 USDC
   - amountOut: 99 USDT
   - targetChainId: 80002 (Polygon Amoy)

2. WalletSwapMain emits OrderInitiated event:
   event OrderInitiated(
       bytes32 indexed orderId,
       address indexed maker,
       address tokenIn,
       address tokenOut,
       uint256 amountIn,
       uint256 timestamp
   )

3. Reactive Network detects event:
   - Subscribes to OrderCreated from EulerLagrangeOrderProcessor
   - Verifies order validity
   - Checks liquidity pool
   - Calculates optimal fill

4. Reactive Network creates callback:
   - callbackId = keccak256(orderId, timestamp, blockNumber)
   - Stores callback data
   - Emits CrossChainCallbackCreated

5. Callback execution on Polygon:
   - executeCallback(callbackId) called
   - Transfers 99 USDT to user
   - Emits CrossChainCallbackExecuted

6. User receives tokens on destination chain
```

## Integration Checklist

### Phase 1: Event Emission
- [x] All contracts emit proper events
- [x] Events have correct indexing
- [x] Event parameters match expected types
- [x] Events logged for monitoring

### Phase 2: Event Subscription
- [ ] Reactive Network contract created
- [ ] Subscriptions configured for all events
- [ ] Topic filters set correctly
- [ ] Subscription callbacks implemented

### Phase 3: Callback Processing
- [ ] Callback handler implemented
- [ ] Callback validation logic added
- [ ] Cross-chain execution tested
- [ ] Error handling implemented

### Phase 4: Testing
- [ ] Unit tests for event emission
- [ ] Integration tests for callbacks
- [ ] Cross-chain tests on testnet
- [ ] Load testing with multiple orders

### Phase 5: Monitoring
- [ ] Event monitoring dashboard
- [ ] Callback tracking system
- [ ] Error alerting setup
- [ ] Performance metrics

## Reactive Network Contract Template

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@reactive-network/reactive-lib/contracts/AbstractReactive.sol";
import "@reactive-network/reactive-lib/contracts/AbstractCallback.sol";

contract MVIReactiveOrchestrator is AbstractReactive, AbstractCallback {
    // System contract address
    address public constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000FFFFFF;
    
    // Reactive constants
    uint256 public constant REACTIVE_IGNORE = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
    
    // Event topics
    bytes32 public constant ORDER_CREATED_TOPIC = 
        keccak256("OrderCreated(bytes32,address,address,address,uint256,uint256,uint256)");
    
    constructor(address _service) AbstractReactive(_service) AbstractCallback(_service) {}
    
    /**
     * @dev Subscribe to OrderCreated events from origin chain
     */
    function subscribeToOrders(
        uint256 sourceChainId,
        address orderProcessorAddress
    ) external {
        (bool success, ) = SYSTEM_CONTRACT.call(
            abi.encodeWithSignature(
                "subscribe(uint256,address,uint256,uint256,uint256,uint256)",
                sourceChainId,
                orderProcessorAddress,
                uint256(ORDER_CREATED_TOPIC),
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            )
        );
        require(success, "Subscription failed");
    }
    
    /**
     * @dev React to OrderCreated events
     */
    function react(
        uint256 chainId,
        address contractAddress,
        uint256 topic0,
        uint256 topic1,
        uint256 topic2,
        uint256 topic3,
        bytes calldata data,
        uint256 blockNumber,
        uint256 logIndex
    ) external vmOnly {
        // Decode event data
        bytes32 orderId = bytes32(topic1);
        address maker = address(uint160(topic2));
        address tokenIn = address(uint160(topic3));
        
        // Decode remaining data
        (address tokenOut, uint256 amountIn, uint256 minutesValueIn) = 
            abi.decode(data, (address, uint256, uint256));
        
        // Process order
        _processOrder(
            orderId,
            maker,
            tokenIn,
            tokenOut,
            amountIn,
            minutesValueIn
        );
    }
    
    /**
     * @dev Process order and trigger callback
     */
    function _processOrder(
        bytes32 orderId,
        address maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minutesValueIn
    ) internal {
        // Verify order
        // Calculate optimal fill
        // Create callback
        // Emit event
    }
}
```

## Testing Reactive Integration

### 1. Local Testing

```bash
# Test event emission
forge test --match-contract EventEmission

# Test callback handling
forge test --match-contract CallbackHandling

# Test cross-chain flow
forge test --match-contract CrossChainFlow
```

### 2. Testnet Testing

```bash
# Deploy to Sepolia
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast

# Create test order
cast send $WALLET_SWAP_MAIN "createOrder(...)" --rpc-url sepolia

# Monitor events
cast logs --address $WALLET_SWAP_MAIN --follow --rpc-url sepolia
```

### 3. Reactive Network Testing

```bash
# Deploy Reactive contract
forge create src/MVIReactiveOrchestrator.sol:MVIReactiveOrchestrator \
  --rpc-url reactive \
  --constructor-args $REACTIVE_SERVICE

# Subscribe to events
cast send $REACTIVE_ORCHESTRATOR \
  "subscribeToOrders(uint256,address)" \
  11155111 \
  $SEPOLIA_ORDER_PROCESSOR \
  --rpc-url reactive
```

## Monitoring & Debugging

### 1. Event Monitoring

```bash
# Watch for OrderCreated events
cast logs \
  --address $ORDER_PROCESSOR \
  --topic "OrderCreated(bytes32,address,address,address,uint256,uint256,uint256)" \
  --follow \
  --rpc-url sepolia
```

### 2. Callback Tracking

```bash
# Check callback status
cast call $WALLET_SWAP_MAIN "getCallback(bytes32)" $CALLBACK_ID \
  --rpc-url polygon_amoy

# Check if callback executed
cast call $WALLET_SWAP_MAIN "callbacks(bytes32)" $CALLBACK_ID \
  --rpc-url polygon_amoy | grep "executed"
```

### 3. Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| Subscription failed | Invalid topic or address | Verify topic hash and contract address |
| Callback not executed | Missing callback ID | Check callback creation in WalletSwapMain |
| Token transfer failed | Insufficient balance | Ensure contract has tokens to transfer |
| Invalid event data | Malformed event | Check event emission in contracts |

## Performance Optimization

### 1. Batch Processing

Process multiple orders in single transaction:

```solidity
function processOrderBatch(bytes32[] calldata orderIds) external {
    for (uint i = 0; i < orderIds.length; i++) {
        _processOrder(orderIds[i]);
    }
}
```

### 2. Event Filtering

Use topic filters to reduce event processing:

```solidity
// Only listen for orders above minimum value
// Topic 3 can encode minimum value
```

### 3. Callback Optimization

Batch callbacks for efficiency:

```solidity
function executeCallbackBatch(bytes32[] calldata callbackIds) external {
    for (uint i = 0; i < callbackIds.length; i++) {
        executeCallback(callbackIds[i]);
    }
}
```

## Security Considerations

1. **Event Verification:** Always verify event source and data
2. **Callback Authorization:** Only execute authorized callbacks
3. **Reentrancy Protection:** Use nonReentrant on callback functions
4. **Event Ordering:** Ensure events processed in correct order
5. **Timeout Handling:** Implement timeout for pending callbacks

## Future Enhancements

1. **Advanced Event Filtering:** More sophisticated topic-based filtering
2. **Conditional Callbacks:** Execute callbacks based on conditions
3. **Multi-Chain Coordination:** Coordinate across 3+ chains
4. **Automated Market Making:** Integrate with DEX liquidity
5. **Oracle Integration:** Use price oracles for better pricing

## Support & Resources

- [Reactive Network Docs](https://docs.reactive.network)
- [Solidity Event Documentation](https://docs.soliditylang.org/en/latest/contracts.html#events)
- [Foundry Testing Guide](https://book.getfoundry.sh/forge/tests)

## Troubleshooting

### Events not detected
1. Verify event emission in contract
2. Check topic hash calculation
3. Verify contract address
4. Check RPC endpoint connectivity

### Callbacks not executing
1. Verify callback creation
2. Check callback ID correctness
3. Verify destination chain configuration
4. Check token balance

### Cross-chain failures
1. Verify bridge configuration
2. Check supported chains
3. Verify token whitelisting
4. Check gas limits
