// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";

contract DeployLasnaCore is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;
        address callbackProxy = vm.envOr("CALLBACK_PROXY", address(uint160(0xFFFFFF)));

        vm.startBroadcast(deployerPrivateKey);

        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        console.log("LASNA_LIQUIDITY_POOL=", address(liquidityPool));

        AssetVerifier assetVerifier = new AssetVerifier();
        console.log("LASNA_ASSET_VERIFIER=", address(assetVerifier));

        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        console.log("LASNA_FEE_DISTRIBUTOR=", address(feeDistributor));
        
        EulerLagrangeOrderProcessor orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );
        console.log("LASNA_ORDER_PROCESSOR=", address(orderProcessor));
        
        WalletSwapMain walletSwap = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            callbackProxy
        );
        console.log("LASNA_WALLET_SWAP_MAIN=", address(walletSwap));

        orderProcessor.setWalletSwapMain(address(walletSwap));

        vm.stopBroadcast();
    }
}
