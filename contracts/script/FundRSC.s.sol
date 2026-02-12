// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

contract FundRSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address rscAddress = vm.parseAddress("0xf628f8AB91833D21C63291526F66001CC9FB9732");
        
        vm.startBroadcast(deployerPrivateKey);
        (bool success, ) = payable(rscAddress).call{value: 1 ether}("");
        require(success, "Transfer failed");
        vm.stopBroadcast();
    }
}
