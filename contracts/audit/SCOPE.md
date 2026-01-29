# Audit Scope

## In-Scope Contracts

The following contracts are **in scope** for this security audit:

| # | Contract | Lines | Priority |
|---|----------|-------|----------|
| 1 | WalletSwapMain.sol | 386 | **Critical** |
| 2 | EulerLagrangeOrderProcessor.sol | 606 | **Critical** |
| 3 | TrustWalletFeeDistributor.sol | 391 | **High** |
| 4 | VirtualLiquidityPool.sol | 244 | Medium |
| 5 | AssetVerifier.sol | 254 | Medium |
| 6 | SwapMatcherRSCv3.sol | 170 | **High** |

**Total Lines in Scope: ~2,051**

---

## Out of Scope

The following are **NOT** in scope:

- OpenZeppelin dependencies (Ownable, ReentrancyGuard, SafeERC20)
- Reactive Network Library (reactive-lib)
- Deployment scripts
- Test files
- Frontend code
- Mock contracts (MockToken.sol, MockNFT.sol)
- Legacy/deprecated contract versions (SwapMatcherRSC.sol, SwapMatcherRSCv2.sol)
- Demo contracts (demos folder)

---

## Priority Areas

### Critical Priority
1. **Token Transfer Logic** - All paths involving token movements
2. **Authorization** - Cross-chain callback authorization
3. **Reentrancy** - State changes before external calls

### High Priority
4. **Fee Calculations** - Overflow, rounding, caps
5. **Order Matching** - Logic correctness, edge cases
6. **RSC Event Processing** - Cross-chain replay prevention

### Medium Priority
7. **Expiration Logic** - Batch processing, refunds
8. **Verification System** - Stale verification attacks
9. **Virtual Liquidity** - Price manipulation

---

## Key User Flows to Test

### Flow 1: Create Order + Instant Match
```
User A: createOrder(TOKEN_A → TOKEN_B, 100, 50)
User B: createOrder(TOKEN_B → TOKEN_A, 50, 100)
Expected: Instant match, both orders filled
```

### Flow 2: Direct Fulfillment
```
User A: createOrder(TOKEN_A → TOKEN_B, 100, 50)
User B: fulfillOrder(orderId)
Expected: Order filled, tokens exchanged
```

### Flow 3: Cross-Chain RSC Settlement
```
Chain A: User creates order targeting Chain B
Chain B: User creates matching order
RSC: Matches orders, emits callbacks
Both chains: executeInterChainOrder() called
```

### Flow 4: Order Cancellation
```
User: createOrder(...)
User: cancelOrder(orderId)
Expected: Order cancelled, tokens refunded
```

### Flow 5: Order Expiration
```
User: createOrder(duration=1hour)
After 1 hour: Anyone calls expireOrders()
Expected: Order expired, tokens refunded
```

---

## Known Issues / Limitations

1. **First-match wins**: No MEV protection for matching order selection
2. **Virtual liquidity**: Not backed by real reserves
3. **Gas limits**: Large ordersByPair arrays may cause gas issues
4. **RSC trust**: Cross-chain settlement requires trusting RSC address

---

## Audit Timeline

Please provide findings within 2 weeks of engagement.

---

*Scope Document v1.0 - 2026-01-28*
