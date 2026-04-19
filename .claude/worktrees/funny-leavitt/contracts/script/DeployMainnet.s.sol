// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";

contract DeployMainnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;
        address callbackProxy = vm.envOr("CALLBACK_PROXY", address(uint160(0xFFFFFF)));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Core Infrastructure
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

        // 3. Deploy Main Entry Point
        WalletSwapMain walletSwapMain = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            callbackProxy
        );
        console.log("WalletSwapMain deployed at:", address(walletSwapMain));

        // 4. Wire Permissions
        orderProcessor.setWalletSwapMain(address(walletSwapMain));
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        console.log("Permissions wired completely");

        vm.stopBroadcast();
    }
}
