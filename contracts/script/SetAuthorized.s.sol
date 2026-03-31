// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/WalletSwapMain.sol";

contract SetAuthorized is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        // Allow passing address as argument or env var, defaulting to env var for now
        address payable walletSwapMainAddress = payable(vm.envAddress("WALLET_SWAP_MAIN"));
        address rscAddress = vm.envAddress("RSC_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        WalletSwapMain(walletSwapMainAddress).setAuthorizedReactiveVM(rscAddress);
        WalletSwapMain(walletSwapMainAddress).setCallbackProxy(rscAddress);
        vm.stopBroadcast();
    }
}
