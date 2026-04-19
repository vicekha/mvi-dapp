// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapCallback.sol";

contract DeployOriginChain is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = vm.envAddress("TRUST_WALLET");
        address callbackProxy = vm.envOr("CALLBACK_PROXY", address(0));

        vm.startBroadcast(deployerPrivateKey);

        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        AssetVerifier assetVerifier = new AssetVerifier();
        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);

        EulerLagrangeOrderProcessor orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );

        WalletSwapCallback walletSwap = new WalletSwapCallback(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            callbackProxy
        );

        orderProcessor.setWalletSwapMain(address(walletSwap));

        // Security Configuration
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(walletSwap), true);

        // Standard logic
        orderProcessor.setMinimumOrderValue(0.001 ether);
        feeDistributor.setMinFeeMinutes(15);
        feeDistributor.setMinNftFeeWei(0.005 ether);

        vm.stopBroadcast();

        console.log("DEPLOYMENT_COMPLETE");
        console.log("WALLET_SWAP_MAIN=", address(walletSwap));
        console.log("ORDER_PROCESSOR=", address(orderProcessor));
        console.log("FEE_DISTRIBUTOR=", address(feeDistributor));
        console.log("ASSET_VERIFIER=", address(assetVerifier));
        console.log("LIQUIDITY_POOL=", address(liquidityPool));
        console.log("CHAIN_ID=", block.chainid);
    }
}
