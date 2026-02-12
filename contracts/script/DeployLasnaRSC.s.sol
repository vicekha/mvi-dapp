// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherRSC.sol";

contract DeployLasnaRSC is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address systemContract = 0x0000000000000000000000000000000000fffFfF;
        
        uint256 sepoliaCID = 11155111;
        uint256 amoyCID = 80002;
        // Correctly checksummed addresses from build log
        address l1Wallet = 0x4a267C1b4926056932659577E6c2C7E15d4AFFEd;
        address amoyWallet = 0xAD18d2B0578388fc4078C1cd7037e7c05E04014C;

        vm.startBroadcast(pk);
        SwapMatcherRSC rsc = new SwapMatcherRSC(
            systemContract,
            sepoliaCID,
            amoyCID,
            l1Wallet,
            amoyWallet
        );
        console.log("RSC_DEPLOYED_AT:", address(rsc));
        vm.stopBroadcast();
    }
}
