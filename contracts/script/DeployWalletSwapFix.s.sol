// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/WalletSwapMain.sol";
import "../src/EulerLagrangeOrderProcessor.sol";

contract DeployWalletSwapFix is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Existing addresses from previous deployment (run-1769891761366)
        address liquidityPool = 0x2807618Ab0aC13339F29CB9Ba281121d24666901;
        address orderProcessor = 0x7eb8feA9659F48B708B6D807D24127C48FB570A2;
        address feeDistributor = 0xaf582313095307A2DA31BE8b25Ef2DF28c81F823;
        address assetVerifier = 0x0A9f6675C1d25eFFd3C930602ec7c0cFda83CF1E;
        // RSC Address for authorization
        address rscAddress = 0x6aa307E69cde3277CaC727eDce689C53DD52437B;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy fixed WalletSwapMain
        WalletSwapMain walletSwapMain = new WalletSwapMain(
            liquidityPool,
            orderProcessor,
            feeDistributor,
            assetVerifier
        );
        console.log("New WalletSwapMain deployed at:", address(walletSwapMain));

        // 2. Update Order Processor to point to new WalletSwapMain
        EulerLagrangeOrderProcessor(orderProcessor).setWalletSwapMain(address(walletSwapMain));
        console.log("Updated OrderProcessor.setWalletSwapMain");

        // 3. Authorize RSC on new WalletSwapMain
        walletSwapMain.setAuthorizedReactiveVM(rscAddress);
        walletSwapMain.setCallbackProxy(rscAddress); // Proxy usually matches RSC in simpel setups or set correctly
        console.log("Authorized RSC on new WalletSwapMain");

        vm.stopBroadcast();
    }
}
