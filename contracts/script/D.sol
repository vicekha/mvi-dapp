// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapBridgeRSC.sol";

contract D is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SwapBridgeRSC rsc = new SwapBridgeRSC();
        
        // Configure bridge addresses
        // Sepolia (11155111) -> 0x254e962943e1620b7d5b43bb5ea0cf0be6761f74
        // Base Sepolia (84532) -> 0x38f90d91cec920ba51472178d76f4b30c842e33e
        address bridgeSepolia = vm.parseAddress("0x254e962943E1620B7d5B43bB5Ea0cF0Be6761f74");
        address bridgeBase = vm.parseAddress("0x38f90D91cEc920bA51472178d76f4b30C842e33E");

        rsc.setBridgeSwapMain(11155111, bridgeSepolia);
        rsc.setBridgeSwapMain(84532, bridgeBase);

        // Subscribe to events on both bridges
        rsc.subscribe(11155111, bridgeSepolia);
        rsc.subscribe(84532, bridgeBase);

        console.log("SwapBridgeRSC deployed and subscribed at:", address(rsc));

        vm.stopBroadcast();
    }
}
