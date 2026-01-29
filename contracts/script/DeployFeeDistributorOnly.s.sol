// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/TrustWalletFeeDistributor.sol";

contract DeployFeeDistributorOnly is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("SEPOLIA_PRIVATE_KEY");
        address trustWallet = 0x0dB12aAC15a63303d1363b8C862332C699Cca561;

        vm.startBroadcast(deployerPrivateKey);

        TrustWalletFeeDistributor feeDistributor = new TrustWalletFeeDistributor(trustWallet);

        console.log("TrustWalletFeeDistributor Deployed at:", address(feeDistributor));
        console.log("Default Trust Wallet:", feeDistributor.defaultTrustWallet());

        vm.stopBroadcast();
    }
}
