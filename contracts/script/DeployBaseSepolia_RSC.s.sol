// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherRSC.sol";

/**
 * @title DeployBaseSepolia_RSC
 * @notice Deploys SwapMatcherRSC on Lasna configured for Lasna <-> Base Sepolia cross-chain swaps
 * @dev Run with: forge script script/DeployBaseSepolia_RSC.s.sol --rpc-url https://lasna-rpc.rnk.dev/ --broadcast --legacy
 */
contract DeployBaseSepolia_RSC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address systemContract = 0x0000000000000000000000000000000000fffFfF;
        
        // Chain Configuration
        uint256 baseSepoliaChainId = 84532;
        uint256 lasnaChainId = 5318007;
        
        // Contract addresses from frontend/src/config/contracts.ts
        // Base Sepolia WalletSwapMain
        address baseSepoliaWalletSwap = 0x45FC261c74016d576d551Ea2f18daBEED0f7d079;
        // Lasna WalletSwapMain (from existing deployment)
        address lasnaWalletSwap = 0x54c774b1B44Adde9C159dBA8e1fbBAeE18235283;

        vm.startBroadcast(pk);
        
        SwapMatcherRSC rsc = new SwapMatcherRSC(
            systemContract,
            baseSepoliaChainId,    // chainA = Base Sepolia
            lasnaChainId,          // chainB = Lasna
            baseSepoliaWalletSwap, // walletSwapA
            lasnaWalletSwap        // walletSwapB
        );
        
        console.log("========================================");
        console.log("RSC DEPLOYED ON LASNA");
        console.log("========================================");
        console.log("RSC Address:", address(rsc));
        console.log("Chain A (Base Sepolia):", baseSepoliaChainId);
        console.log("Chain B (Lasna):", lasnaChainId);
        console.log("WalletSwap A:", baseSepoliaWalletSwap);
        console.log("WalletSwap B:", lasnaWalletSwap);
        console.log("========================================");
        
        vm.stopBroadcast();
    }
}
