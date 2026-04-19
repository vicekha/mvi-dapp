// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";

/**
 * @title DeployLasnaCoreOnly
 * @notice Deploys ONLY the core contracts (no RSC) to fix ordersByPair issue
 */
contract DeployLasnaCoreOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Core Stack on Lasna
        VirtualLiquidityPool liquidityPool = new VirtualLiquidityPool();
        AssetVerifier assetVerifier = new AssetVerifier();
        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        
        EulerLagrangeOrderProcessor orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );
        
        WalletSwapMain walletSwap = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            address(0) // Set later
        );

        // Configure ownership
        orderProcessor.setWalletSwapMain(address(walletSwap));

        vm.stopBroadcast();

        console.log("LASNA_CORE_DEPLOYMENT_COMPLETE");
        console.log("LASNA_WALLET_SWAP_MAIN:", address(walletSwap));
        console.log("LASNA_ORDER_PROCESSOR:", address(orderProcessor));
        console.log("LASNA_FEE_DISTRIBUTOR:", address(feeDistributor));
        console.log("LASNA_ASSET_VERIFIER:", address(assetVerifier));
        console.log("LASNA_LIQUIDITY_POOL:", address(liquidityPool));
    }
}
