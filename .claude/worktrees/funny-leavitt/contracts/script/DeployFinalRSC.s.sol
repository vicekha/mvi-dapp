// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherMultiChain.sol";
import "../src/WalletSwapMain.sol";

contract DeployFinalRSC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        
        uint256[] memory ids = new uint256[](0);
        address[] memory addrs = new address[](0);

        vm.startBroadcast(pk);
        SwapMatcherMultiChain rsc = new SwapMatcherMultiChain(deployer, ids, addrs);
        console.log("RSC_DEPLOYED_AT=", address(rsc));
        vm.stopBroadcast();
    }
}
