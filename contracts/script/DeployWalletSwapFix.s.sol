// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/WalletSwapMain.sol";
import "../src/EulerLagrangeOrderProcessor.sol";

contract DeployWalletSwapFix is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        address liquidityPool = vm.parseAddress("0x8c82a4Fd3769D3D8E07bf281f6F08Aa9ea9904c7");
        address orderProcessor = vm.parseAddress("0xAa7d02D01a52d567a205032982ff28850d19c7aC");
        address feeDistributor = vm.parseAddress("0xE305fAbD8F5f97B0CFF0c4BD5Af4a6DEa0E4bBCa");
        address assetVerifier = vm.parseAddress("0x2170c42E65F2286aDcF2231A84626BE74cb275Ee");

        vm.startBroadcast(deployerPrivateKey);

        WalletSwapMain walletSwapMain = new WalletSwapMain(
            liquidityPool,
            orderProcessor,
            feeDistributor,
            assetVerifier
        );

        EulerLagrangeOrderProcessor(orderProcessor).setWalletSwapMain(address(walletSwapMain));

        vm.stopBroadcast();
    }
}
