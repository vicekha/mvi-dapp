// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/WalletSwapMain.sol";

contract AuthorizeRSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Load target contract addresses from env
        address walletSwapAddress;
        address rscAddress = vm.envAddress("SWAP_MATCHER_RSC_ADDRESS"); // Pass this in command line or env

        // Determine chain to select correct WalletSwap address
        uint256 chainId = block.chainid;
        if (chainId == 11155111) {
            walletSwapAddress = vm.envAddress("WALLET_SWAP_SEPOLIA");
        } else if (chainId == 5318007) {
            walletSwapAddress = vm.envAddress("WALLET_SWAP_LASNA");
        } else {
            revert("Unsupported chain");
        }

        vm.startBroadcast(deployerPrivateKey);

        WalletSwapMain(payable(walletSwapAddress)).setAuthorizedReactiveVM(rscAddress);
        console.log("Authorized RSC", rscAddress, "on WalletSwapMain", walletSwapAddress);

        vm.stopBroadcast();
    }
}
