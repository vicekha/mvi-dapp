// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/WalletSwapMain.sol";

/**
 * @notice Authorize a deployed SwapMatcherMultiChain RSC on a WalletSwapMain instance.
 *         Set RSC_ADDRESS and WALLET_SWAP_ADDRESS in .env before running.
 */
contract AuthorizeRSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address walletSwapAddress  = vm.envAddress("WALLET_SWAP_ADDRESS");
        address rscAddress         = vm.envAddress("RSC_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        WalletSwapMain walletSwap = WalletSwapMain(payable(walletSwapAddress));
        walletSwap.setAuthorizedReactiveVM(rscAddress);
        walletSwap.setCallbackProxy(rscAddress);

        vm.stopBroadcast();

        console.log("RSC authorized on WalletSwapMain:", walletSwapAddress);
        console.log("RSC address:", rscAddress);
    }
}
