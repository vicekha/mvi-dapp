// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/MockStablecoin.sol";

contract MintToAgents is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        address agentA = vm.envAddress("AGENT_A_WALLET");
        address agentB = vm.envAddress("AGENT_B_WALLET");

        MockStablecoin usdt = MockStablecoin(vm.envAddress("MUSDT_ADDRESS"));
        MockStablecoin dai = MockStablecoin(vm.envAddress("MDAI_ADDRESS"));

        vm.startBroadcast(deployerPrivateKey);

        // Agent A sells mUSDT → give them mUSDT
        usdt.mint(agentA, 10000 * 10 ** 6);
        console.log("Minted 10000 mUSDT to Agent A:", agentA);

        // Agent B sells mDAI → give them mDAI
        dai.mint(agentB, 10000 * 10 ** 18);
        console.log("Minted 10000 mDAI to Agent B:", agentB);

        vm.stopBroadcast();
    }
}
