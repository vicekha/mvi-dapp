// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

/// @notice Fund a deployed SwapMatcherMultiChain RSC with ETH for callback gas.
///         Set RSC_ADDRESS and FUND_AMOUNT_ETH in .env before running.
contract FundRSC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address rscAddress         = vm.envAddress("RSC_ADDRESS");
        uint256 fundAmount         = vm.envOr("FUND_AMOUNT_ETH", uint256(0.1 ether));

        vm.startBroadcast(deployerPrivateKey);
        (bool success,) = payable(rscAddress).call{value: fundAmount}("");
        require(success, "ETH transfer failed");
        vm.stopBroadcast();

        console.log("Funded RSC:", rscAddress);
        console.log("Amount (wei):", fundAmount);
    }
}
