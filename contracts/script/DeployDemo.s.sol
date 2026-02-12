// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/demos/BasicDemoReactiveContract.sol";

contract DeployDemo is Script {
    function run() external {
        uint256 originChainId = 11155111; // Sepolia
        uint256 destinationChainId = 5318007; // Lasna
        address contractToMonitor = 0x356d97d0991A55db1f83c061eF318eE68598748e; // Sepolia WalletSwap
        uint256 topic0 = 0x058e802e2eed1657b621f4c6666f47d07adc8268c419f51940b8d60d9ff78dca; // OrderInitiated
        address callbackAddr = 0x555346d562F55de7963375dB522580653F0d3A5f; // Lasna WalletSwap
        
        address systemContract = 0x0000000000000000000000000000000000fffFfF; 

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        BasicDemoReactiveContract demo = new BasicDemoReactiveContract{value: 0.1 ether}(
            systemContract,
            originChainId,
            destinationChainId,
            contractToMonitor,
            topic0,
            callbackAddr
        );

        console.log("Demo RSC deployed at:", address(demo));

        vm.stopBroadcast();
    }
}
