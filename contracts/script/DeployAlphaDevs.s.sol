// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/AlphaDevs.sol";

/**
 * @title DeployAlphaDevs
 * @notice Deploys the Alpha Devs NFT collection and mints 10 NFTs
 */
contract DeployAlphaDevs is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy NFT contract
        AlphaDevs nft = new AlphaDevs();
        
        // Mint 10 NFTs to the deployer
        nft.batchMint(deployer, 10);
        
        vm.stopBroadcast();
        
        console.log("ALPHA_DEVS_NFT_ADDRESS:", address(nft));
        console.log("Minted 10 Alpha Devs NFTs to:", deployer);
    }
}
