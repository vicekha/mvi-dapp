// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";
import "../src/SwapMatcherRSC.sol";

contract DeployLasna is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;
        address systemContract = 0x0000000000000000000000000000000000fffFfF;

        // Chain Config
        uint256 sepoliaChainId = 11155111;
        uint256 amoyChainId = 80002;
        // From recent deployment: Sepolia WalletSwapMain
        address l1Wallet = 0x4a267C1b4926056932659577E6c2C7E15d4AFFEd; 
        address amoyWallet = 0xAD18d2B0578388fc4078C1cd7037e7c05E04014C;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Core Stack on Lasna (as an execution environment)
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
            address(assetVerifier)
        );

        orderProcessor.setWalletSwapMain(address(walletSwap));

        // 2. Deploy Reactive Smart Contract
        // NOTE: RSC is what actually makes the network "Reactive" by listening to other chains
        SwapMatcherRSC rsc = new SwapMatcherRSC(
            systemContract,
            sepoliaChainId,
            amoyChainId,
            l1Wallet,
            amoyWallet
        );

        // 3. Authorization & Initialization
        walletSwap.setAuthorizedReactiveVM(address(rsc));
        walletSwap.setCallbackProxy(address(rsc));
        
        // Subscriptions moved to post-deployment cast calls to avoid script reverts
        // rsc.manualSubscribe(sepoliaChainId, l1Wallet);
        // rsc.manualSubscribe(amoyChainId, amoyWallet);
        // rsc.manualSubscribe(block.chainid, address(walletSwap));

        vm.stopBroadcast();

        console.log("LASNA_DEPLOYMENT_COMPLETE");
        console.log("LASNA_WALLET_SWAP_MAIN=", address(walletSwap));
        console.log("LASNA_ORDER_PROCESSOR=", address(orderProcessor));
        console.log("LASNA_FEE_DISTRIBUTOR=", address(feeDistributor));
        console.log("LASNA_ASSET_VERIFIER=", address(assetVerifier));
        console.log("LASNA_LIQUIDITY_POOL=", address(liquidityPool));
        console.log("LASNA_SWAP_MATCHER_RSC=", address(rsc));
    }
}
