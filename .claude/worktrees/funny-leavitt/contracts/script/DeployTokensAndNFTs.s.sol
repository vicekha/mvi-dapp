// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/MockToken.sol";
import "../src/MockStablecoin.sol";
import "../src/MockNFT.sol";

contract DeployTokensAndNFTs is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Normal Token
        MockToken normalToken = new MockToken();
        console.log("Normal MOCK Token deployed at:", address(normalToken));

        // Deploy Stablecoins
        MockStablecoin usdc = new MockStablecoin("Mock USDC", "USDC", 6);
        console.log("Mock USDC deployed at:", address(usdc));

        MockStablecoin usdt = new MockStablecoin("Mock USDT", "USDT", 6);
        console.log("Mock USDT deployed at:", address(usdt));

        // Deploy NFTs
        MockNFT redNFT = new MockNFT("Red NFT", "RED");
        console.log("Red NFT deployed at:", address(redNFT));

        MockNFT blueNFT = new MockNFT("Blue NFT", "BLUE");
        console.log("Blue NFT deployed at:", address(blueNFT));

        MockNFT whiteNFT = new MockNFT("White NFT", "WHITE");
        console.log("White NFT deployed at:", address(whiteNFT));

        vm.stopBroadcast();
    }
}
