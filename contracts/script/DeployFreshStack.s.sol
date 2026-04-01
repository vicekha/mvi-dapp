// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/WalletSwapMain.sol";
import "../src/EulerLagrangeOrderProcessor.sol";

contract DeployFreshStack is Script {
    function run() external {
        // Direct key mapping to avoid env issues
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address liquidityPool = vm.parseAddress("0x8c82a4Fd3769D3D8E07bf281f6F08Aa9ea9904c7");
        address feeDistributor = vm.parseAddress("0xE305fAbD8F5f97B0CFF0c4BD5Af4a6DEa0E4bBCa");
        address assetVerifier = vm.parseAddress("0x2170c42E65F2286aDcF2231A84626BE74cb275Ee");
        address rscAddress = vm.parseAddress("0x6aa307E69cde3277CaC727eDce689C53DD52437B");

        vm.startBroadcast(deployerPrivateKey);

        EulerLagrangeOrderProcessor orderProcessor = new EulerLagrangeOrderProcessor(
            liquidityPool,
            feeDistributor,
            assetVerifier
        );
        console.log("New OrderProcessor deployed at:", address(orderProcessor));

        WalletSwapMain walletSwapMain = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier),
            address(0) // Set later
        );
        console.log("New WalletSwapMain deployed at:", address(walletSwapMain));

        orderProcessor.setWalletSwapMain(address(walletSwapMain));
        console.log("Updated OrderProcessor.setWalletSwapMain");

        walletSwapMain.setAuthorizedReactiveVM(rscAddress);
        walletSwapMain.setCallbackProxy(rscAddress);
        console.log("Authorized RSC on new WalletSwapMain");

        vm.stopBroadcast();
    }
}
