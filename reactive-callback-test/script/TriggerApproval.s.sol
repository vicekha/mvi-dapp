// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "forge-std/Script.sol";

interface IERC721 {
    function approve(address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function mint(address to) external returns (uint256);
}

contract TriggerApproval is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address mockNFT = 0x42B965Ac6f70196d5FB9df8513e28eF4fE728ebd;
        
        vm.startBroadcast(deployerPrivateKey);
        
        IERC721 nft = IERC721(mockNFT);
        
        // Try to mint a new NFT first
        try nft.mint(msg.sender) returns (uint256 tokenId) {
            console.log("Minted NFT with ID:", tokenId);
            // Now approve it to trigger the Approval event
            nft.approve(address(0x1), tokenId);
            console.log("Approved NFT, Approval event emitted!");
        } catch {
            // If mint fails, try approving token 1
            console.log("Mint failed, trying to approve token 1");
            nft.approve(address(0x1), 1);
            console.log("Approved token 1, Approval event emitted!");
        }
        
        vm.stopBroadcast();
    }
}
