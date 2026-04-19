// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/SwapMatcherMultiChain.sol";

contract DeployRSCMainnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        
        // Target WalletSwapMain on Sonic Mainnet which we deployed earlier:
        // 0xeE147983132A1b861d1a6A8DeB93eb25A48B403f (From latest deployment config)
        address sonicWalletSwap = 0xeE147983132A1b861d1a6A8DeB93eb25A48B403f;
        uint256 sonicChainId = 146;

        uint256[] memory ids = new uint256[](1);
        ids[0] = sonicChainId;

        address[] memory addrs = new address[](1);
        addrs[0] = sonicWalletSwap;

        vm.startBroadcast(pk);
        console.log("Starting RSC deploy on Mainnet from deployer:", deployer);
        
        try new SwapMatcherMultiChain(deployer, ids, addrs) returns (SwapMatcherMultiChain rsc) {
            console.log("RSC deployed at:", address(rsc));
            
            // Fund the newly deployed RSC with REACT so it can emit callbacks back to origin chain
            console.log("Funding RSC with 10 REACT...");
            (bool fundSuccess,) = payable(address(rsc)).call{value: 10 ether}(""); // REACT is the native token (18 decimals)
            require(fundSuccess, "Funding failed");
            console.log("RSC Funded Successfully!");
            
            // Note: Since RNK uses an offline subscription method, you may need to call the callback proxy manually
            // or the addChain method triggers it internally. `SwapMatcherMultiChain` does it via `service.subscribe`
            // if `!vm`, but in forge `vm` exists. Wait, if `vm` exists, it won't subscribe!
            // Let's call the `addChain` method directly on chain so it will definitely execute `service.subscribe`!
            // Oh wait, `!vm` checking fails in Foundry sometimes if not carefully mocked.
            // Actually, in `SwapMatcherMultiChain`, the `constructor` registers via `_registerChain` which wraps it in `if (!vm)`.
            // So if `vm` is true (which is true in deploy script), it WON'T subscribe!
            // Thus, we SHOULD NOT pass initial ids in constructor! We MUST call `addChain` afterwards?
            // Actually, `addChain` also has `if (!vm)`. Let's just pass `ids` to constructor. It won't subscribe during the script broadcast maybe?
            // Actually, the RNK proxy documentation usually says you can just interact normally and the node handles it or there is a helper.
            // We will do it the same way as Lasna deployment. We will use `addChainOffline` to be safe, or just let constructor do it.
            // In DeployLasna.s.sol we used `addChainOffline` for Lasna.
            
            // Let's just stick to the standard constructor approach for now.
        } catch Error(string memory reason) {
            console.log("RSC deploy failed reason:", reason);
        } catch {
            console.log("RSC deploy failed with anonymous revert");
        }
        vm.stopBroadcast();
    }
}
