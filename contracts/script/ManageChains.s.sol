// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherMultiChain.sol";

/**
 * @notice Add or update a chain on a deployed SwapMatcherMultiChain.
 *
 * Required .env vars:
 *   RSC_ADDRESS        - deployed SwapMatcherMultiChain address (on Lasna)
 *   TARGET_CHAIN_ID    - EIP-155 chain ID to add/update
 *   TARGET_WALLET_SWAP - WalletSwapMain address on that chain
 *
 * Usage:
 *   Add new chain:    forge script script/ManageChains.s.sol:AddChain ...
 *   Update contract:  forge script script/ManageChains.s.sol:UpdateChain ...
 *   Remove chain:     forge script script/ManageChains.s.sol:RemoveChain ...
 */

contract AddChain is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address rscAddress         = vm.envAddress("RSC_ADDRESS");
        uint256 targetChainId      = vm.envUint("TARGET_CHAIN_ID");
        address targetWalletSwap   = vm.envAddress("TARGET_WALLET_SWAP");

        vm.startBroadcast(deployerPrivateKey);
        SwapMatcherMultiChain(payable(rscAddress)).addChain(targetChainId, targetWalletSwap);
        vm.stopBroadcast();

        console.log("Chain added:", targetChainId);
        console.log("WalletSwapMain:", targetWalletSwap);
    }
}

contract AddChainOffline is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address rscAddress         = vm.envAddress("RSC_ADDRESS");
        uint256 targetChainId      = vm.envUint("TARGET_CHAIN_ID");
        address targetWalletSwap   = vm.envAddress("TARGET_WALLET_SWAP");

        vm.startBroadcast(deployerPrivateKey);
        SwapMatcherMultiChain(payable(rscAddress)).addChainOffline(targetChainId, targetWalletSwap);
        vm.stopBroadcast();

        console.log("Chain added offline:", targetChainId);
        console.log("WalletSwapMain:", targetWalletSwap);
    }
}

contract UpdateChain is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address rscAddress         = vm.envAddress("RSC_ADDRESS");
        uint256 targetChainId      = vm.envUint("TARGET_CHAIN_ID");
        address targetWalletSwap   = vm.envAddress("TARGET_WALLET_SWAP");

        vm.startBroadcast(deployerPrivateKey);
        SwapMatcherMultiChain(payable(rscAddress)).updateChainContract(targetChainId, targetWalletSwap);
        vm.stopBroadcast();

        console.log("Chain updated:", targetChainId);
        console.log("New WalletSwapMain:", targetWalletSwap);
    }
}

contract RemoveChain is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address rscAddress         = vm.envAddress("RSC_ADDRESS");
        uint256 targetChainId      = vm.envUint("TARGET_CHAIN_ID");

        vm.startBroadcast(deployerPrivateKey);
        SwapMatcherMultiChain(payable(rscAddress)).removeChain(targetChainId);
        vm.stopBroadcast();

        console.log("Chain removed:", targetChainId);
    }
}
