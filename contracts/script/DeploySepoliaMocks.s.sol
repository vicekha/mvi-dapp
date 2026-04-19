// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "forge-std/Script.sol";
import {MockStablecoin} from "../src/MockStablecoin.sol";

contract DeploySepoliaMocks is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Sepolia Mock Stablecoin Deployment Log ===");
        console.log("Deployer Address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock USDC (6 decimals)
        MockStablecoin mockUSDC = new MockStablecoin("Mock USDC", "USDC", 6);
        console.log("Mock USDC Address:", address(mockUSDC));

        // 2. Deploy Mock USDT (6 decimals)
        MockStablecoin mockUSDT = new MockStablecoin("Mock USDT", "USDT", 6);
        console.log("Mock USDT Address:", address(mockUSDT));

        // 3. Mint for testing (1,000,000 units each)
        mockUSDC.mint(deployer, 1_000_000 * 10**6);
        mockUSDT.mint(deployer, 1_000_000 * 10**6);
        
        console.log("Minted 1,000,000 USDC and USDT to:", deployer);

        vm.stopBroadcast();
        console.log("=== Sepolia Mock Deployments COMPLETED ===");
    }
}
