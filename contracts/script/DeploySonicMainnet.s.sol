// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapCallback.sol";

contract DeploySonicMainnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        // Using existing TRUST_WALLET environment variable, falling back if necessary
        address trustWallet = vm.envAddress("TRUST_WALLET");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Core Components
        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        console.log("VirtualLiquidityPool deployed at:", address(liquidityPool));

        AssetVerifier assetVerifier = new AssetVerifier();
        console.log("AssetVerifier deployed at:", address(assetVerifier));

        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        console.log("TrustWalletFeeDistributor deployed at:", address(feeDistributor));

        // 2. Deploy Order Processor
        EulerLagrangeOrderProcessor orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );
        console.log("EulerLagrangeOrderProcessor deployed at:", address(orderProcessor));

        // 3. Deploy WalletSwapCallback
        WalletSwapCallback walletSwap = new WalletSwapCallback(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            address(0) // Set later
        );
        console.log("WalletSwapCallback deployed at:", address(walletSwap));

        // 4. Configuration
        orderProcessor.setWalletSwapMain(address(walletSwap));
        console.log("Linked OrderProcessor to WalletSwapCallback");
        
        // Security Configuration
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(walletSwap), true);
        console.log("Authorized callers for LiquidityPool");

        orderProcessor.setMinimumOrderValue(0.01 ether); // $0.50 base minimum in native S
        console.log("Set minimum order value to 0.01 S");

        feeDistributor.setMinFeeMinutes(15);
        feeDistributor.setMinNftFeeWei(0.005 ether);
        feeDistributor.setAutoRouteNativeToken(true); // Sonic is an origin chain
        console.log("Configured FeeDistributor minimums and auto-routing");

        // Register WalletSwapCallback for automated debt coverage
        feeDistributor.registerReactiveContract(address(walletSwap));
        console.log("Registered WalletSwapCallback with FeeDistributor");

        vm.stopBroadcast();
    }
}
