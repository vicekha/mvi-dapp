// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/TrustWalletFeeDistributor.sol";

/**
 * @title ManageOriginNativeFees
 * @notice Used on Origin chains (Base, Arbitrum, BSC, Optimism, Polygon) to extract
 * trapped native EVM currency and enable automatic direct-to-wallet forwarding.
 */
contract ManageOriginNativeFees is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address payable destinationWallet = payable(vm.envAddress("DEFAULT_TRUST_WALLET"));
        
        // Target your deployed fee distributor
        address feeDistributorAddress = vm.envAddress("FEE_DISTRIBUTOR_ADDRESS");
        TrustWalletFeeDistributor feeDistributor = TrustWalletFeeDistributor(payable(feeDistributorAddress));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Withdraw any currently accumulated native fees (ETH, MATIC, BNB, etc.)
        uint256 accumulated = feeDistributor.accumulatedFees(address(0));
        if (accumulated > 0) {
            feeDistributor.withdrawAccumulatedFees(accumulated, destinationWallet);
            console.log("Withdrawn accumulated Native Fees:", accumulated);
            console.log("Destination:", destinationWallet);
        } else {
            console.log("No accumulated native fees to withdraw.");
        }

        // 2. Enable Auto-Routing so future native fees skip the accumulation phase entirely
        if (!feeDistributor.autoRouteNativeToken()) {
            feeDistributor.setAutoRouteNativeToken(true);
            console.log("Enabled auto-routing of native fees (Bypassing Debt Accumulation).");
        } else {
            console.log("Auto-routing is already enabled.");
        }

        vm.stopBroadcast();
    }
}
