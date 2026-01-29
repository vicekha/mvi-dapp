// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherRSCv3.sol";

contract DeployLasnaRSCv3 is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        
        // System contract address on Reactive Network
        address systemContract = 0x0000000000000000000000000000000000fffFfF;
        
        uint256 sepoliaCID = 11155111;
        uint256 lasnaCID = 5318007;
        
        // Correctly checksummed addresses
        address sepoliaWallet = 0xB8489abc7f5df9aDD04579bb74eC3C958D59Ee21;
        address lasnaWallet = 0x26F39A1c4687645744D7e377f4738CDa5164A254;

        vm.startBroadcast(pk);
        // Deploy without value - will fund and subscribe separately
        SwapMatcherRSCv3 rsc = new SwapMatcherRSCv3(
            systemContract,
            sepoliaCID,
            lasnaCID,
            sepoliaWallet,
            lasnaWallet
        );
        console.log("RSCv3_DEPLOYED_AT:", address(rsc));
        vm.stopBroadcast();
    }
}
