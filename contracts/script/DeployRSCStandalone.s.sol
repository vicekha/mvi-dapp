// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherMultiChain.sol";

contract DeployRSCStandalone is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        
        uint256[] memory ids = new uint256[](0);
        address[] memory addrs = new address[](0);

        vm.startBroadcast(pk);
        console.log("Starting RSC deploy...");
        try new SwapMatcherMultiChain(deployer, ids, addrs) returns (SwapMatcherMultiChain rsc) {
            console.log("RSC deployed at:", address(rsc));
        } catch Error(string memory reason) {
            console.log("RSC deploy failed reason:", reason);
        } catch {
            console.log("RSC deploy failed with anonymous revert");
        }
        vm.stopBroadcast();
    }
}
