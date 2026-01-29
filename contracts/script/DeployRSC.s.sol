// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherRSC.sol";

contract DeployRSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // System Contract on Reactive Network
        address systemContract = 0x0000000000000000000000000000000000fffFfF;
        
        // Chain IDs
        uint256 sepoliaChainId = 11155111;
        uint256 amoyChainId = 80002;
        
        // WalletSwapMain addresses
        address sepoliaWalletSwap = 0xB8489abc7f5df9aDD04579bb74eC3C958D59Ee21;
        address amoyWalletSwap = 0xAD18d2B0578388fc4078C1cd7037e7c05E04014C;
        
        vm.startBroadcast(deployerPrivateKey);
        
        SwapMatcherRSC rsc = new SwapMatcherRSC(
            systemContract,
            sepoliaChainId,
            amoyChainId,
            sepoliaWalletSwap,
            amoyWalletSwap
        );
        
        console.log("SwapMatcherRSC deployed at:", address(rsc));
        
        vm.stopBroadcast();
    }
}
