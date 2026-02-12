// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapBridgeRSC.sol";

contract Dep is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        address rsc = address(new SwapBridgeRSC());
        console.log("Deployed to:", rsc);
        vm.stopBroadcast();
    }
}
