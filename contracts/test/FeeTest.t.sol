// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/MockToken.sol";

contract FeeTest is Test {
    TrustWalletFeeDistributor feeDistributor;
    MockToken tokenA;
    address trustWallet = address(0x999);
    address sender = address(0x123);

    // Mock System Contract address to intercept calls
    address constant SYSTEM_CONTRACT = address(uint160(0xFFFFFF));

    function setUp() public {
        // Deploy Mock Token
        tokenA = new MockToken();
        tokenA.mint(sender, 1000 ether);

        // Deploy Distributor
        feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        
        vm.deal(sender, 10 ether);
    }

    function testAutoForwardERC20() public {
        uint256 amount = 10000 * 10**18;
        uint256 fee = amount * 100 / 10000; // 1%
        
        tokenA.mint(sender, amount + fee); 
        
        vm.prank(sender);
        tokenA.approve(address(feeDistributor), fee);
        
        uint256 initBal = tokenA.balanceOf(trustWallet);
        
        vm.prank(sender);
        feeDistributor.distributeFee(
            address(tokenA), 
            TrustWalletFeeDistributor.AssetType.ERC20, 
            amount, 
            0, 
            sender, 
            bytes32(0)
        );
        
        assertEq(tokenA.balanceOf(trustWallet), initBal + fee, "Trust Wallet should receive token fee");
    }

    function testAutoForwardNative() public {
        uint256 amount = 1 ether;
        uint256 fee = amount * 100 / 10000; // 1%
        
        uint256 initBal = trustWallet.balance;
        
        vm.prank(sender);
        // Send exact fee
        feeDistributor.distributeFee{value: fee}(
            address(0), 
            TrustWalletFeeDistributor.AssetType.ERC20, 
            amount, 
            0, 
            sender, 
            bytes32(0)
        );
        
        assertEq(trustWallet.balance, initBal + fee, "Trust Wallet should receive native fee");
    }
}
