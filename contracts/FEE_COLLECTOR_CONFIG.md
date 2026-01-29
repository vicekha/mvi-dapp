# Fee Collector Configuration

## Default Trust Wallet Address

**Address:** `0x0dB12aAC15a63303d1363b8C862332C699Cca561`

This address will receive all collected fees after debt coverage.

---

## Deployment Configuration

### All Fee Distributor Versions

When deploying any version of TrustWalletFeeDistributor, use this address as the `_defaultTrustWallet` constructor parameter:

```solidity
// V1 - TrustWalletFeeDistributor
constructor(0x0dB12aAC15a63303d1363b8C862332C699Cca561)

// V2 - TrustWalletFeeDistributorV2
constructor(
    0x0dB12aAC15a63303d1363b8C862332C699Cca561,  // defaultTrustWallet
    <FEE_SWAPPER_ADDRESS>                          // feeSwapper
)

// V3 - TrustWalletFeeDistributorV3
constructor(
    0x0dB12aAC15a63303d1363b8C862332C699Cca561,  // defaultTrustWallet
    <HYBRID_CONVERTER_ADDRESS>                     // hybridConverter
)

// V4 - TrustWalletFeeDistributorV4 (Auto-Distribution)
constructor(
    0x0dB12aAC15a63303d1363b8C862332C699Cca561,  // defaultTrustWallet
    <HYBRID_CONVERTER_ADDRESS>                     // hybridConverter
)
```

---

## Deployment Commands

### Using Forge

```bash
# V4 (Recommended - Auto Distribution)
forge create src/TrustWalletFeeDistributorV4.sol:TrustWalletFeeDistributorV4 \
    --constructor-args 0x0dB12aAC15a63303d1363b8C862332C699Cca561 <HYBRID_CONVERTER> \
    --rpc-url <RPC_URL> \
    --private-key <PRIVATE_KEY>

# V3 (Hybrid Conversion)
forge create src/TrustWalletFeeDistributorV3.sol:TrustWalletFeeDistributorV3 \
    --constructor-args 0x0dB12aAC15a63303d1363b8C862332C699Cca561 <HYBRID_CONVERTER> \
    --rpc-url <RPC_URL> \
    --private-key <PRIVATE_KEY>

# V2 (Uniswap Conversion)
forge create src/TrustWalletFeeDistributorV2.sol:TrustWalletFeeDistributorV2 \
    --constructor-args 0x0dB12aAC15a63303d1363b8C862332C699Cca561 <FEE_SWAPPER> \
    --rpc-url <RPC_URL> \
    --private-key <PRIVATE_KEY>

# V1 (Basic)
forge create src/TrustWalletFeeDistributor.sol:TrustWalletFeeDistributor \
    --constructor-args 0x0dB12aAC15a63303d1363b8C862332C699Cca561 \
    --rpc-url <RPC_URL> \
    --private-key <PRIVATE_KEY>
```

---

## Post-Deployment Verification

After deployment, verify the address is set correctly:

```bash
# Check default Trust Wallet
cast call <FEE_DISTRIBUTOR_ADDRESS> "defaultTrustWallet()(address)"

# Expected output: 0x0dB12aAC15a63303d1363b8C862332C699Cca561
```

---

## Token-Specific Wallets (Optional)

If you want specific tokens to go to different addresses:

```solidity
// Set USDC fees to different address
feeDistributor.setTrustWalletAddress(
    0xUSDC_ADDRESS,
    0xYourUSDCWallet
);

// Set USDT fees to different address
feeDistributor.setTrustWalletAddress(
    0xUSDT_ADDRESS,
    0xYourUSDTWallet
);
```

**Otherwise, everything goes to:** `0x0dB12aAC15a63303d1363b8C862332C699Cca561`

---

## Fee Flow

```
User pays fee
    ↓
Convert to native (if ERC20)
    ↓
Cover debt (if any)
    ↓
→ 0x0dB12aAC15a63303d1363b8C862332C699Cca561 💰
```

---

## Changing Fee Collector Address

If you need to change it later:

```solidity
// Only owner can call this
feeDistributor.setDefaultTrustWallet(newAddress);
```
