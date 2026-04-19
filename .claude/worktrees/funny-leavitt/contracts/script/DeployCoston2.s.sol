// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";


contract DeployCoston2 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;

        vm.startBroadcast(deployerPrivateKey);

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

        orderProcessor.setWalletSwapMain(address(walletSwap));

        // Security Configuration (New)
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(walletSwap), true);
        console.log("Authorized callers for LiquidityPool");

        orderProcessor.setMinimumOrderValue(0.01 ether);
        feeDistributor.setMinFeeMinutes(15);
        feeDistributor.setMinNftFeeWei(0.005 ether);
        console.log("Configured FeeDistributor minimums");

        address sepoliaWallet = vm.envOr("WALLET_SWAP_SEPOLIA", address(0));
        address baseSepoliaWallet = vm.envOr("WALLET_SWAP_BASESEPOLIA", address(0));

        vm.stopBroadcast();

        console.log("=== Coston2 FULL DEPLOYMENT LOG ===");
        console.log("VirtualLiquidityPool:", address(liquidityPool));
        console.log("AssetVerifier:", address(assetVerifier));
        console.log("TrustWalletFeeDistributor:", address(feeDistributor));
        console.log("EulerLagrangeOrderProcessor:", address(orderProcessor));
        console.log("WalletSwapMain:", address(walletSwap));
        console.log("WalletSwapMain:", address(walletSwap));
    }
}
