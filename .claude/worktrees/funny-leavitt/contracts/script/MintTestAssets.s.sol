// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/MockToken.sol";
import "../src/MockStablecoin.sol";
import "../src/MockNFT.sol";

contract MintTestAssets is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);

        // Read addresses from env variables for flexibility across chains
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address usdtAddress = vm.envAddress("USDT_ADDRESS");
        address mockAddress = vm.envAddress("MOCK_ADDRESS");
        
        address redAddress = vm.envAddress("RED_ADDRESS");
        address blueAddress = vm.envAddress("BLUE_ADDRESS");
        address whiteAddress = vm.envAddress("WHITE_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Minting assets to:", deployerAddress);

        // Mint 1,000,000 of each ERC20
        if (usdcAddress != address(0)) {
            MockStablecoin(usdcAddress).mint(deployerAddress, 1_000_000 * 10**6);
            console.log("Minted 1M USDC");
        }
        if (usdtAddress != address(0)) {
            MockStablecoin(usdtAddress).mint(deployerAddress, 1_000_000 * 10**6);
            console.log("Minted 1M USDT");
        }
        if (mockAddress != address(0)) {
            MockToken(mockAddress).mint(deployerAddress, 1_000_000 * 10**18);
            console.log("Minted 1M MOCK");
        }

        // Mint 10 of each NFT
        if (redAddress != address(0)) {
            for (uint i = 0; i < 10; i++) {
                MockNFT(redAddress).mint(deployerAddress);
            }
            console.log("Minted 10 RED NFTs");
        }
        
        if (blueAddress != address(0)) {
            for (uint i = 0; i < 10; i++) {
                MockNFT(blueAddress).mint(deployerAddress);
            }
            console.log("Minted 10 BLUE NFTs");
        }
        
        if (whiteAddress != address(0)) {
            for (uint i = 0; i < 10; i++) {
                MockNFT(whiteAddress).mint(deployerAddress);
            }
            console.log("Minted 10 WHITE NFTs");
        }

        vm.stopBroadcast();
    }
}
