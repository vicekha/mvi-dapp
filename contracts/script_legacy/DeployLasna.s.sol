// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {VirtualLiquidityPool} from "../src/VirtualLiquidityPool.sol";
import {EulerLagrangeOrderProcessor} from "../src/EulerLagrangeOrderProcessor.sol";
import {TrustWalletFeeDistributor} from "../src/TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "../src/AssetVerifier.sol";
import {WalletSwapMain} from "../src/WalletSwapMain.sol";
import {ReactiveHyperlaneBridge} from "../src/ReactiveHyperlaneBridge.sol";
import {MockNFT} from "../src/MockNFT.sol";

// import {ReactiveOrderMatcher} from "../src/ReactiveOrderMatcher.sol";

/**
 * @title DeployLasnaScript
 * @dev Deployment script for Reactive Network Lasna Testnet
 *
 * Usage:
 * forge script script/DeployLasna.s.sol:DeployLasnaScript \
 *   --rpc-url https://lasna-rpc.rnk.dev/ \
 *   --private-key $PRIVATE_KEY \
 *   --broadcast \
 *   -vv
 */
contract DeployLasnaScript is Script {
    // Lasna Testnet Configuration
    string constant LASNA_RPC = "https://lasna-rpc.rnk.dev/";
    uint256 constant LASNA_CHAIN_ID = 111;

    // Lasna default Hyperlane mailbox (placeholder - update if Lasna has Hyperlane)
    address constant LASNA_MAILBOX = address(uint160(0xFFFFFF));
    uint256 constant DEFAULT_BRIDGE_FEE = 50; // 0.5%

    // Deployment addresses
    address public liquidityPoolAddr;
    address public orderProcessorAddr;
    address public feeDistributorAddr;
    address public assetVerifierAddr;
    address public walletSwapMainAddr;
    address public bridgeAddr;
    address public mockNftAddr;
    address public reactiveOrderMatcherAddr;

    // Configuration
    address public trustWallet;
    address public owner;

    function setUp() public {
        owner = msg.sender;
        trustWallet = vm.envOr("TRUST_WALLET", msg.sender);
    }

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Use env vars if set, otherwise use defaults for Lasna
        address mailbox = vm.envOr("HYPERLANE_MAILBOX", LASNA_MAILBOX);
        uint256 bridgeFee = vm.envOr("BRIDGE_FEE_PERCENTAGE", DEFAULT_BRIDGE_FEE);

        vm.startBroadcast(deployerPrivateKey);

        console2.log("Deploying to Lasna Testnet (Chain ID: %d)", LASNA_CHAIN_ID);
        console2.log("Deployer:", msg.sender);
        console2.log("Trust Wallet:", trustWallet);

        // 1. Deploy VirtualLiquidityPool
        console2.log("\n[1/7] Deploying VirtualLiquidityPool...");
        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        liquidityPoolAddr = address(liquidityPool);
        console2.log("VirtualLiquidityPool:", liquidityPoolAddr);

        // 2. Deploy TrustWalletFeeDistributor
        console2.log("\n[2/7] Deploying TrustWalletFeeDistributor...");
        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        feeDistributorAddr = address(feeDistributor);
        console2.log("TrustWalletFeeDistributor:", feeDistributorAddr);

        // 3. Deploy AssetVerifier
        console2.log("\n[3/7] Deploying AssetVerifier...");
        AssetVerifier assetVerifier = new AssetVerifier();
        assetVerifierAddr = address(assetVerifier);
        console2.log("AssetVerifier:", assetVerifierAddr);

        // 4. Deploy EulerLagrangeOrderProcessor (depends on pool, fee dist, verifier)
        console2.log("\n[4/7] Deploying EulerLagrangeOrderProcessor...");
        EulerLagrangeOrderProcessor orderProcessor =
            new EulerLagrangeOrderProcessor(liquidityPoolAddr, feeDistributorAddr, assetVerifierAddr);
        orderProcessorAddr = address(orderProcessor);
        console2.log("EulerLagrangeOrderProcessor:", orderProcessorAddr);

        // 5. Deploy WalletSwapMain
        console2.log("\n[5/7] Deploying WalletSwapMain...");
        WalletSwapMain walletSwapMain =
            new WalletSwapMain(liquidityPoolAddr, orderProcessorAddr, feeDistributorAddr, assetVerifierAddr);
        console2.log("WalletSwapMain deployed at:", address(walletSwapMain));
        walletSwapMainAddr = address(walletSwapMain);

        /*
        // Deploy ReactiveOrderMatcher
        ReactiveOrderMatcher matcher = new ReactiveOrderMatcher(walletSwapMainAddr, orderProcessorAddr);
        console2.log("ReactiveOrderMatcher deployed at:", address(matcher));
        reactiveOrderMatcherAddr = address(matcher);

        // Authorize WalletSwapMain to update orders in OrderProcessor
        orderProcessor.setWalletSwapMain(walletSwapMainAddr);
        console2.log("Authorized WalletSwapMain in OrderProcessor");
        */

        // Authorize WalletSwapMain to update orders in OrderProcessor
        orderProcessor.setWalletSwapMain(walletSwapMainAddr);
        console2.log("Authorized WalletSwapMain in OrderProcessor");

        // Fund Fee Distributor with initial native tokens if needed
        // vm.deal(feeDistributorAddr, 1 ether); // Example: Fund with 1 ETH

        // 6. Deploy ReactiveHyperlaneBridge
        console2.log("\n[6/7] Deploying ReactiveHyperlaneBridge...");
        ReactiveHyperlaneBridge bridge = new ReactiveHyperlaneBridge(
            mailbox,
            trustWallet, // Use trust wallet as fee collector
            bridgeFee
        );
        bridgeAddr = address(bridge);
        console2.log("ReactiveHyperlaneBridge:", bridgeAddr);

        // 7. Deploy MockNFT (NEW)
        console2.log("\n[7/8] Deploying MockNFT...");
        MockNFT mockNft = new MockNFT();
        mockNftAddr = address(mockNft);
        console2.log("MockNFT:", mockNftAddr);

        // 8. Register WalletSwapMain for debt coverage
        console2.log("\n[8/8] Registering for debt coverage...");
        feeDistributor.registerReactiveContract(walletSwapMainAddr);
        console2.log("WalletSwapMain registered for debt coverage");

        vm.stopBroadcast();

        // Print deployment summary
        printDeploymentSummary();
    }

    function printDeploymentSummary() internal view {
        console2.log("\n");
        console2.log("================================================================");
        console2.log("           DEPLOYMENT SUMMARY - LASNA TESTNET                  ");
        console2.log("================================================================");
        console2.log("");
        console2.log("CORE CONTRACTS:");
        console2.log("  VirtualLiquidityPool:      ", liquidityPoolAddr);
        console2.log("  OrderProcessor:            ", orderProcessorAddr);
        console2.log("  FeeDistributor:            ", feeDistributorAddr);
        console2.log("  AssetVerifier:             ", assetVerifierAddr);
        console2.log("");
        console2.log("MAIN CONTRACTS:");
        console2.log("  WalletSwapMain:            ", walletSwapMainAddr);
        console2.log("  ReactiveHyperlaneBridge:   ", bridgeAddr);
        console2.log("  MockNFT:                   ", mockNftAddr);
        console2.log("");
        console2.log("CONFIGURATION:");
        console2.log("  Trust Wallet:              ", trustWallet);
        console2.log("  Deployer:                  ", msg.sender);
        console2.log("");
        console2.log("NEXT STEPS:");
        console2.log("  1. Fund WalletSwapMain with REACT for gas fees");
        console2.log("  2. Register test tokens in fee distributor");
        console2.log("  3. Test order creation and execution");
        console2.log("  4. Monitor debt coverage");
        console2.log("");
    }
}
