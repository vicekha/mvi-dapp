// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "forge-std/Script.sol";
import "../src/CallbackReceiver.sol";
import "../src/MinimalRSC.sol";

contract DeployAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Configuration
        uint256 sepoliaChainId = 11155111;
        address mockNFTSepolia = 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd; // MockNFT on Sepolia
        uint256 lasnaChainId = 5318007;
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 1. Deploy CallbackReceiver
        CallbackReceiver receiver = new CallbackReceiver();
        console.log("CallbackReceiver deployed at:", address(receiver));
        
        // 2. Deploy MinimalRSC with value for gas
        MinimalRSC rsc = new MinimalRSC{value: 0.1 ether}(
            sepoliaChainId,
            mockNFTSepolia,
            lasnaChainId,
            address(receiver)
        );
        console.log("MinimalRSC deployed at:", address(rsc));
        console.log("RSC is listening to Sepolia chain:", sepoliaChainId);
        console.log("RSC will callback to receiver at:", address(receiver));
        
        vm.stopBroadcast();
    }
}
