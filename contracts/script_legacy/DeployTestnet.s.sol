// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/WalletSwapMain.sol";
import "../src/MockNFT.sol";

/**
 * @title DeployTestnet
 * @dev Deployment script for Sepolia and Lasna testnets
 *
 * Usage:
 *   forge script script/DeployTestnet.s.sol:DeployTestnet \
 *       --rpc-url $SEPOLIA_RPC_URL \
 *       --broadcast \
 *       --verify
 *
 * Required .env variables:
 *   PRIVATE_KEY - Deployer private key
 *   TRUST_WALLET - Fee collector address (0x0dB12aAC15a63303d1363b8C862332C699Cca561)
 */
contract DeployTestnet is Script {
    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = vm.envAddress("TRUST_WALLET");

        console.log("=== MVI DApp Testnet Deployment ===");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Fee Collector:", trustWallet);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy VirtualLiquidityPool
        console.log("Deploying VirtualLiquidityPool...");
        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        console.log("  VirtualLiquidityPool:", address(liquidityPool));

        // 2. Deploy AssetVerifier
        console.log("Deploying AssetVerifier...");
        AssetVerifier assetVerifier = new AssetVerifier();
        console.log("  AssetVerifier:", address(assetVerifier));

        // 3. Deploy TrustWalletFeeDistributor (V1 - Basic) - BEFORE OrderProcessor
        console.log("Deploying TrustWalletFeeDistributor...");
        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        console.log("  TrustWalletFeeDistributor:", address(feeDistributor));

        // 4. Deploy EulerLagrangeOrderProcessor - NOW with valid fee distributor
        console.log("Deploying EulerLagrangeOrderProcessor...");
        EulerLagrangeOrderProcessor orderProcessor =
            new EulerLagrangeOrderProcessor(address(liquidityPool), address(feeDistributor), address(assetVerifier));
        console.log("  EulerLagrangeOrderProcessor:", address(orderProcessor));

        // 5. Deploy WalletSwapMain
        console.log("Deploying WalletSwapMain...");
        WalletSwapMain walletSwap = new WalletSwapMain(
            address(liquidityPool), address(orderProcessor), address(feeDistributor), address(assetVerifier)
        );
        console.log("  WalletSwapMain:", address(walletSwap));

        // 6. Deploy MockNFT for testing
        console.log("Deploying MockNFT...");
        MockNFT mockNFT = new MockNFT();
        console.log("  MockNFT:", address(mockNFT));

        // Configure contracts
        console.log("\nConfiguring contracts...");

        // Set WalletSwapMain in OrderProcessor
        orderProcessor.setWalletSwapMain(address(walletSwap));
        console.log("  WalletSwapMain set in OrderProcessor");

        // Transfer OrderProcessor ownership to WalletSwapMain
        orderProcessor.transferOwnership(address(walletSwap));
        console.log("  OrderProcessor ownership transferred to WalletSwapMain");

        // Register WalletSwapMain for debt coverage
        feeDistributor.registerReactiveContract(address(walletSwap));
        console.log("  WalletSwapMain registered for debt coverage");

        vm.stopBroadcast();

        // Print summary
        console.log("\n=== Deployment Complete ===\n");

        console.log("Copy these addresses to frontend/src/config/contracts.ts:\n");
        console.log("  WALLET_SWAP_MAIN:", address(walletSwap));
        console.log("  ORDER_PROCESSOR:", address(orderProcessor));
        console.log("  FEE_DISTRIBUTOR:", address(feeDistributor));
        console.log("  ASSET_VERIFIER:", address(assetVerifier));
        console.log("  MOCK_NFT:", address(mockNFT));
        console.log("");

        console.log("Addresses saved. Copy them to frontend config.");
    }
}
