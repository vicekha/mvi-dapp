// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/BridgeSwapMain.sol";

contract DeployBridge is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy BridgeSwapMain with address(0) for authorizedRVM to allow manual testing
        // In production, this would be set to the Reactive VM's callback address
        BridgeSwapMain bridge = new BridgeSwapMain(address(0));

        console.log("BridgeSwapMain deployed at:", address(bridge));

        vm.stopBroadcast();
    }
}
