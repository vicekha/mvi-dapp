# Mainnet Deployment Guide

This guide describes how to deploy the Multi V.I. DApp contracts to production networks (Ethereum Mainnet, Polygon, Reactive Mainnet).

## Prerequisites
1. **Private Key**: Ensure your deployer wallet is funded on the target network.
   - *Security Note*: For mainnet, consider using a hardware wallet or `cast send --ledger` if possible, though the provided script uses environment variables.
2. **RPC Keys**: Ensure you have valid API keys for Infura/Alchemy (if not using public RPCs).
   - Set these in your `.env` file or export them in your shell.

## 1. Configuration
Open `contracts/deploy_mainnet.ps1` and verify the `TrustWalletFeeDistributor` recipient address.
```powershell
$trustWallet = "0x..." # Update to your production fee recipient wallet
```

## 2. Deployment
Use the `deploy_mainnet.ps1` script to deploy to your chosen network.

### Ethereum Mainnet
```powershell
./deploy_mainnet.ps1 -Network "mainnet"
```

### Polygon Mainnet
```powershell
./deploy_mainnet.ps1 -Network "polygon"
```

### Reactive Mainnet (if available)
```powershell
./deploy_mainnet.ps1 -Network "mainnet_reactive" -RpcUrl "https://rpc.reactive.network"
```

## 3. Post-Deployment Steps
After the script completes, it will output the deployed contract addresses.

1. **Copy Addresses**: Take the addresses from the script output.
2. **Update Frontend**: Open `frontend/src/config/contracts.ts`.
3. **Fill Placeholders**: Paste the addresses into the corresponding Chain ID section (e.g., `1` for Eth, `137` for Polygon).
   ```typescript
   1: {
       WALLET_SWAP_MAIN: '0x...',
       ORDER_PROCESSOR: '0x...',
       // ...
   }
   ```
4. **Deploy Frontend**: Build and deploy your React app to your hosting provider (Vercel/Netlify/etc.).

## 4. Verification
- Verify contracts on Etherscan/PolygonScan using `forge verify-contract`.
- Perform a small test swap on Mainnet to ensure end-to-end functionality.
