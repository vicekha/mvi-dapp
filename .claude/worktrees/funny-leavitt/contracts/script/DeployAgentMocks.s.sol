// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/MockStablecoin.sol";

contract DeployAgentMocks is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Agent wallet addresses (passed via env or hardcoded after creation)
        address agentA = vm.envAddress("AGENT_A_WALLET");
        address agentB = vm.envAddress("AGENT_B_WALLET");

        // Token amounts to distribute
        uint256 usdtAmount = vm.envOr("USDT_AMOUNT", uint256(10000)); // default 10k USDT
        uint256 daiAmount = vm.envOr("DAI_AMOUNT", uint256(10000));   // default 10k DAI

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Mock USDT (6 decimals like real USDT)
        MockStablecoin usdt = new MockStablecoin("Mock USDT", "mUSDT", 6);
        console.log("Mock USDT deployed at:", address(usdt));

        // Deploy Mock DAI (18 decimals like real DAI)
        MockStablecoin dai = new MockStablecoin("Mock DAI", "mDAI", 18);
        console.log("Mock DAI deployed at:", address(dai));

        // Mint to deployer first
        uint256 usdtMintAmount = usdtAmount * 10 ** 6;
        uint256 daiMintAmount = daiAmount * 10 ** 18;

        // Mint and distribute USDT
        // Agent A gets USDT (will sell USDT)
        usdt.mint(agentA, usdtMintAmount);
        console.log("Minted mUSDT to Agent A:", usdtAmount);

        // Server wallet gets USDT too (for fulfillment fallback)
        usdt.mint(deployer, usdtMintAmount);
        console.log("Minted mUSDT to deployer:", usdtAmount);

        // Mint and distribute DAI
        // Agent B gets DAI (will sell DAI)
        dai.mint(agentB, daiMintAmount);
        console.log("Minted mDAI to Agent B:", daiAmount);

        // Server wallet gets DAI too
        dai.mint(deployer, daiMintAmount);
        console.log("Minted mDAI to deployer:", daiAmount);

        vm.stopBroadcast();
    }
}
