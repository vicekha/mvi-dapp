# Deployment Checklist - Lasna Testnet

## Pre-Deployment

- [ ] Foundry installed (`forge --version`)
- [ ] Git repository cloned
- [ ] `.env.example` copied to `.env`
- [ ] `PRIVATE_KEY` set in `.env`
- [ ] `TRUST_WALLET` set in `.env`
- [ ] Private key has testnet REACT for gas
- [ ] Internet connection stable
- [ ] RPC endpoint accessible

## Build & Test

- [ ] Run `forge build` successfully
- [ ] All contracts compile without errors
- [ ] Run `forge test -vv` successfully
- [ ] All tests pass
- [ ] Gas report generated (optional)
- [ ] No warnings in compilation

## Deployment

- [ ] Run `make deploy-lasna`
- [ ] Deployment completes without errors
- [ ] All 6 contracts deployed
- [ ] Contract addresses noted
- [ ] Addresses saved to `.env`

## Post-Deployment Verification

### Contract Verification
- [ ] VirtualLiquidityPool deployed
- [ ] EulerLagrangeOrderProcessor deployed
- [ ] TrustWalletFeeDistributor deployed
- [ ] AssetVerifier deployed
- [ ] WalletSwapMain deployed
- [ ] ReactiveHyperlaneBridge deployed

### Explorer Verification
- [ ] Visit https://lasna.reactscan.net
- [ ] Search for each contract address
- [ ] Verify contract code is visible
- [ ] Verify contract owner is correct
- [ ] Verify initialization events emitted

### Component Integration
- [ ] WalletSwapMain has correct component addresses
- [ ] FeeDistributor registered for debt coverage
- [ ] OrderProcessor has correct dependencies
- [ ] AssetVerifier initialized

## Funding & Configuration

### Fund Contracts
- [ ] Send REACT to WalletSwapMain
- [ ] Check balance: `cast balance $WALLET_SWAP_MAIN_ADDR`
- [ ] Verify balance > 0

### Register Tokens
- [ ] Whitelist test token 1
- [ ] Whitelist test token 2
- [ ] Verify whitelist status

### Configure Trust Wallet
- [ ] Set trust wallet for token 1
- [ ] Set trust wallet for token 2
- [ ] Verify configuration

## Testing

### Basic Functionality
- [ ] Create test order
- [ ] Verify order created event
- [ ] Check order in order processor
- [ ] Verify liquidity pool updated

### Fee Collection
- [ ] Create order with fee
- [ ] Verify fee collected
- [ ] Check accumulated fees
- [ ] Verify fee distributor balance

### Debt Coverage
- [ ] Check initial debt status
- [ ] Create orders to accumulate fees
- [ ] Verify debt coverage attempted
- [ ] Check contract status on explorer

### Cross-Chain (if applicable)
- [ ] Create cross-chain order
- [ ] Verify callback created
- [ ] Check callback tracking
- [ ] Monitor for callback execution

## Monitoring

### Event Tracking
- [ ] Monitor OrderCreated events
- [ ] Monitor FeeDistributed events
- [ ] Monitor DebtCovered events
- [ ] Monitor CrossChainCallbackCreated events

### Contract Health
- [ ] Check contract balance
- [ ] Verify no errors in logs
- [ ] Monitor gas usage
- [ ] Check for any failed transactions

### Performance
- [ ] Measure order creation time
- [ ] Check gas usage per operation
- [ ] Verify event emission timing
- [ ] Monitor RPC response times

## Documentation

- [ ] Save all contract addresses
- [ ] Document deployment time
- [ ] Record initial configuration
- [ ] Note any issues encountered
- [ ] Update deployment guide with actual addresses

## Security Checks

- [ ] Verify contract ownership
- [ ] Check access control settings
- [ ] Verify reentrancy protection
- [ ] Check for any security warnings
- [ ] Review contract code on explorer

## Final Verification

- [ ] All contracts deployed
- [ ] All tests passing
- [ ] All events emitting correctly
- [ ] Fee collection working
- [ ] Debt coverage functioning
- [ ] Cross-chain setup ready (if applicable)
- [ ] Documentation complete
- [ ] Ready for mainnet (optional)

## Deployment Summary

**Deployment Date:** _______________

**Deployer Address:** _______________

**Network:** Lasna Testnet (Chain ID: 111)

**Contracts Deployed:**
- [ ] VirtualLiquidityPool: _______________
- [ ] OrderProcessor: _______________
- [ ] FeeDistributor: _______________
- [ ] AssetVerifier: _______________
- [ ] WalletSwapMain: _______________
- [ ] ReactiveHyperlaneBridge: _______________

**Trust Wallet:** _______________

**Initial Funding:** _______________

**Notes:**
```
_________________________________________
_________________________________________
_________________________________________
```

## Next Steps

1. Monitor contract activity
2. Collect performance metrics
3. Test with real transactions
4. Gather user feedback
5. Plan mainnet deployment
6. Schedule security audit (if needed)

---

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete

**Completed By:** _______________

**Date Completed:** _______________
