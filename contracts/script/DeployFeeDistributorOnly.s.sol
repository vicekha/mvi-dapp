// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/TrustWalletFeeDistributor.sol";

contract DeployFeeDistributorOnly is Script {
    function run() external {
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;

        vm.startBroadcast();

        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);

        console.log("TrustWalletFeeDistributor Deployed at:", address(feeDistributor));
        console.log("Default Trust Wallet:", feeDistributor.defaultTrustWallet());
        console.log("Fee Rate (basis points):", feeDistributor.feeRate());

        vm.stopBroadcast();
    }
}
