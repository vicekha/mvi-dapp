// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";
import "../src/SwapMatcherMultiChain.sol";

contract DeployLasna is Script {
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
            address(assetVerifier)
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

        // Initial chains to register in the RSC
        address sepoliaWallet = vm.envOr("WALLET_SWAP_SEPOLIA", address(0));
        
        uint256[] memory initialIds = new uint256[](0);
        address[] memory initialAddrs = new address[](0);

        console.log("Deploying RSC...");
        SwapMatcherMultiChain rsc = new SwapMatcherMultiChain(
            deployer,
            initialIds,
            initialAddrs
        );
        console.log("RSC deployed at:", address(rsc));

        /*
        console.log("Funding RSC...");
        (bool fundSuccess,) = payable(address(rsc)).call{value: 0.1 ether}("");
        require(fundSuccess, "Funding failed");
        */

        console.log("Configuring RSC chains...");
        // 1. Lasna (Self)
        try rsc.addChainOffline(5318007, address(walletSwap)) {
            console.log("Added Lasna chain.");
        } catch Error(string memory reason) {
            console.log("Failed to add Lasna chain:", reason);
        } catch (bytes memory data) {
            if (data.length >= 4) {
                bytes4 selector;
                assembly { selector := mload(add(data, 0x20)) }
                console.log("Failed to add Lasna chain (selector):");
                console.logBytes4(selector);
            } else {
                console.log("Failed to add Lasna chain (bytes length):", data.length);
            }
        }
        
        // 2. Sepolia (Remote)
        if (sepoliaWallet != address(0)) {
            try rsc.addChainOffline(11155111, sepoliaWallet) {
                console.log("Registered Sepolia chain:", sepoliaWallet);
            } catch Error(string memory reason) {
                console.log("Failed to add Sepolia chain:", reason);
            } catch (bytes memory data) {
                console.log("Failed to add Sepolia chain (bytes length):", data.length);
            }
        }

        console.log("Setting RSC on WalletSwap...");
        walletSwap.setAuthorizedReactiveVM(address(rsc));
        walletSwap.setCallbackProxy(address(rsc));
        console.log("Config finished.");

        vm.stopBroadcast();

        console.log("DEPLOYMENT_COMPLETE");
        console.log("WALLET_SWAP_MAIN=",  address(walletSwap));
        console.log("ORDER_PROCESSOR=",   address(orderProcessor));
        console.log("FEE_DISTRIBUTOR=",   address(feeDistributor));
        console.log("ASSET_VERIFIER=",    address(assetVerifier));
        console.log("LIQUIDITY_POOL=",    address(liquidityPool));
        console.log("SWAP_MATCHER_RSC=",  address(rsc));
    }
}
