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

contract DeployScript is Script {
    // Deployment addresses
    address public liquidityPoolAddr;
    address public orderProcessorAddr;
    address public feeDistributorAddr;
    address public assetVerifierAddr;
    address public walletSwapMainAddr;
    address public bridgeAddr;

    // Configuration
    address public trustWallet;
    address public owner;

    function setUp() public {
        owner = msg.sender;
        // Set trust wallet - change to your address
        trustWallet = vm.envOr("TRUST_WALLET", msg.sender);
    }

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address mailbox = vm.envAddress("HYPERLANE_MAILBOX");
        uint256 bridgeFee = vm.envUint("BRIDGE_FEE_PERCENTAGE");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy VirtualLiquidityPool
        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        liquidityPoolAddr = address(liquidityPool);
        console2.log("VirtualLiquidityPool deployed at:", liquidityPoolAddr);

        // 2. Deploy TrustWalletFeeDistributor (Moved up as dependency)
        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        feeDistributorAddr = address(feeDistributor);
        console2.log("TrustWalletFeeDistributor deployed at:", feeDistributorAddr);

        // 3. Deploy AssetVerifier (Moved up as dependency)
        AssetVerifier assetVerifier = new AssetVerifier();
        assetVerifierAddr = address(assetVerifier);
        console2.log("AssetVerifier deployed at:", assetVerifierAddr);

        // 4. Deploy EulerLagrangeOrderProcessor (Now has dependencies)
        EulerLagrangeOrderProcessor orderProcessor =
            new EulerLagrangeOrderProcessor(liquidityPoolAddr, feeDistributorAddr, assetVerifierAddr);
        orderProcessorAddr = address(orderProcessor);
        console2.log("EulerLagrangeOrderProcessor deployed at:", orderProcessorAddr);

        // 5. Deploy WalletSwapMain
        WalletSwapMain walletSwapMain =
            new WalletSwapMain(liquidityPoolAddr, orderProcessorAddr, feeDistributorAddr, assetVerifierAddr);
        walletSwapMainAddr = address(walletSwapMain);
        console2.log("WalletSwapMain deployed at:", walletSwapMainAddr);

        // 6. Deploy ReactiveHyperlaneBridge
        ReactiveHyperlaneBridge bridge = new ReactiveHyperlaneBridge(
            mailbox,
            trustWallet, // Use trust wallet as fee collector
            bridgeFee
        );
        bridgeAddr = address(bridge);
        console2.log("ReactiveHyperlaneBridge deployed at:", bridgeAddr);

        // 7. Register WalletSwapMain for debt coverage
        feeDistributor.registerReactiveContract(walletSwapMainAddr);
        console2.log("WalletSwapMain registered for debt coverage");

        // 8. Configure OrderProcessor
        orderProcessor.setWalletSwapMain(walletSwapMainAddr);
        console2.log("OrderProcessor configured with WalletSwapMain");

        vm.stopBroadcast();

        // Log deployment summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("VirtualLiquidityPool:", liquidityPoolAddr);
        console2.log("OrderProcessor:", orderProcessorAddr);
        console2.log("FeeDistributor:", feeDistributorAddr);
        console2.log("AssetVerifier:", assetVerifierAddr);
        console2.log("WalletSwapMain:", walletSwapMainAddr);
        console2.log("Bridge:", bridgeAddr);
        console2.log("Trust Wallet:", trustWallet);
    }
}
