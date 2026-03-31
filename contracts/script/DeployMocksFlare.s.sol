// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {MockToken} from "../src/MockToken.sol";
import {MockNFT} from "../src/MockNFT.sol";

contract DeployMocksFlare is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Flare Coston2 Mock Token & NFT Deployment Log ===");
        console.log("Deployer Address:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock Tokens
        MockToken mockToken = new MockToken();
        console.log("MOCK:", address(mockToken));

        MockToken mockUSDC = new MockToken();
        console.log("Mock USDC:", address(mockUSDC));

        MockToken mockUSDT = new MockToken();
        console.log("Mock USDT:", address(mockUSDT));

        // 2. Deploy Mock NFTs
        MockNFT nftRed = new MockNFT("MockNFT Red", "MRED");
        console.log("MockNFT Red:", address(nftRed));

        MockNFT nftBlue = new MockNFT("MockNFT Blue", "MBLU");
        console.log("MockNFT Blue:", address(nftBlue));

        MockNFT nftWhite = new MockNFT("MockNFT White", "MWHT");
        console.log("MockNFT White:", address(nftWhite));

        // 3. Minting for convenience
        mockToken.mint(deployer, 100000 ether);
        mockUSDC.mint(deployer, 1000000000 * 10**6);
        mockUSDT.mint(deployer, 1000000000 * 10**6);
        console.log("Minted ERC20 token stashes to deployer");

        nftRed.mint(deployer);
        nftBlue.mint(deployer);
        nftWhite.mint(deployer);
        console.log("Minted NFTs to deployer");

        vm.stopBroadcast();
        console.log("=== Mock Deployments COMPLETED ===");
    }
}
