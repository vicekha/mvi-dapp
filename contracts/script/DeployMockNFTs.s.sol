// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "forge-std/Script.sol";
import {MockNFT} from "../src/MockNFT.sol";

contract DeployMockNFTs is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Mock NFT Deployment Log ===");
        console.log("Deployer Address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock NFT Red (MRED)
        MockNFT nftRed = new MockNFT("MockNFT Red", "MRED");
        console.log("MockNFT Red Address:", address(nftRed));

        // 2. Deploy Mock NFT Blue (MBLU)
        MockNFT nftBlue = new MockNFT("MockNFT Blue", "MBLU");
        console.log("MockNFT Blue Address:", address(nftBlue));

        // 3. Mint 5 for testing (Token IDs 1-5)
        for (uint256 i = 0; i < 5; i++) {
            nftRed.mint(deployer);
            nftBlue.mint(deployer);
        }
        
        console.log("Minted 5 Red and 5 Blue NFTs to:", deployer);

        vm.stopBroadcast();
        console.log("=== Mock NFT Deployments COMPLETED ===");
    }
}
