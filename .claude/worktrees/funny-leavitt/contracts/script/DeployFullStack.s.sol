// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";

contract DeployFullStack is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;
        address callbackProxy = vm.envOr("CALLBACK_PROXY", address(0));

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

        // 3. Deploy WalletSwapMain
        WalletSwapMain walletSwap = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            callbackProxy
        );
        console.log("WalletSwapMain deployed at:", address(walletSwap));

        // 4. Configuration
        orderProcessor.setWalletSwapMain(address(walletSwap));
        console.log("Linked OrderProcessor to WalletSwapMain");
        
        // Security Configuration (New)
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(walletSwap), true);
        console.log("Authorized callers for LiquidityPool");

        orderProcessor.setMinimumOrderValue(0.01 ether); // $20-$30 at current ETH price
        console.log("Set minimum order value to 0.01 ETH");

        feeDistributor.setMinFeeMinutes(15);
        feeDistributor.setMinNftFeeWei(0.005 ether);
        console.log("Configured FeeDistributor minimums");

        // Register WalletSwapMain for automated debt coverage
        feeDistributor.registerReactiveContract(address(walletSwap));
        console.log("Registered WalletSwapMain with FeeDistributor");

        vm.stopBroadcast();

        // Output for verification
        string memory finalLog = string(abi.encodePacked(
            "DEPLOYMENT_COMPLETE\n",
            "SEPOLIA_LIQUIDITY_POOL=", vm.toString(address(liquidityPool)), "\n",
            "SEPOLIA_ASSET_VERIFIER=", vm.toString(address(assetVerifier)), "\n",
            "SEPOLIA_FEE_DISTRIBUTOR=", vm.toString(address(feeDistributor)), "\n",
            "SEPOLIA_ORDER_PROCESSOR=", vm.toString(address(orderProcessor)), "\n",
            "SEPOLIA_WALLET_SWAP_MAIN=", vm.toString(address(walletSwap))
        ));
        console.log(finalLog);
    }
}
