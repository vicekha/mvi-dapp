// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/MockToken.sol";
import "../src/MockStablecoin.sol";
import "../src/MockNFT.sol";

contract MintInitialMocks is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // Addresses for the current chain (to be replaced or passed via env)
        address mockTokenAddr = vm.envAddress("MOCK_TOKEN");
        address mockUsdcAddr = vm.envAddress("MOCK_USDC");
        address mockUsdtAddr = vm.envAddress("MOCK_USDT");
        address redNFTAddr = vm.envAddress("RED_NFT");
        address blueNFTAddr = vm.envAddress("BLUE_NFT");
        address whiteNFTAddr = vm.envAddress("WHITE_NFT");

        // Mint ERC20s (1,000,000 each)
        MockToken(mockTokenAddr).mint(deployer, 1_000_000 * 10**18);
        MockStablecoin(mockUsdcAddr).mint(deployer, 1_000_000 * 10**6);
        MockStablecoin(mockUsdtAddr).mint(deployer, 1_000_000 * 10**6);

        // Mint NFTs (5 each)
        for (uint256 i = 0; i < 5; i++) {
            MockNFT(redNFTAddr).mint(deployer);
            MockNFT(blueNFTAddr).mint(deployer);
            MockNFT(whiteNFTAddr).mint(deployer);
        }

        vm.stopBroadcast();
    }
}
