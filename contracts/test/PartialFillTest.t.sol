// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/AssetVerifier.sol";
import "../src/MockToken.sol";

contract PartialFillTest is Test {
    WalletSwapMain walletSwap;
    EulerLagrangeOrderProcessor orderProcessor;
    VirtualLiquidityPool liquidityPool;
    TrustWalletFeeDistributor feeDistributor;
    AssetVerifier assetVerifier;
    MockToken tokenA;
    MockToken tokenB;

    address maker = address(0x1);
    address taker = address(0x2);
    address trustWallet = address(0x999);

    function setUp() public {
        liquidityPool = new VirtualLiquidityPool();
        feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        assetVerifier = new AssetVerifier();
        
        orderProcessor = new EulerLagrangeOrderProcessor(
            address(liquidityPool),
            address(feeDistributor),
            address(assetVerifier)
        );
        
        walletSwap = new WalletSwapMain(
            address(liquidityPool),
            address(orderProcessor),
            address(feeDistributor),
            address(assetVerifier)
        );

        orderProcessor.setWalletSwapMain(address(walletSwap));
        orderProcessor.transferOwnership(address(walletSwap)); // Transfer ownership so WalletSwap can update status

        tokenA = new MockToken();
        tokenB = new MockToken();

        tokenA.mint(maker, 1000 ether);
        tokenB.mint(taker, 1000 ether);
    }

    function testSuccessfulPartialFill() public {
        // Maker wants to swap 100 TokenA for 100 TokenB
        uint256 amountIn = 100 ether;
        uint256 amountOut = 100 ether;

        vm.startPrank(maker);
        tokenA.approve(address(walletSwap), amountIn);
        tokenA.mint(maker, 10 ether); 
        tokenA.approve(address(feeDistributor), 10 ether);

        bytes32 orderId = walletSwap.createOrder{value: 0}(
            address(tokenA),
            address(tokenB),
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC20,
            amountIn,
            amountOut,
            amountIn, // min val
            amountOut, // min val
            0, // slippage
            1 days,
            false,
            0 // local chain
        );
        vm.stopPrank();

        // Taker wants to fill only HALF (50)
        uint256 fillAmount = 50 ether;
        vm.startPrank(taker);
        tokenB.approve(address(walletSwap), fillAmount);
        
        uint256 initMakerBalA = tokenA.balanceOf(maker); // Should be 0 (all locked in order? No, user tokens remain in wallet with SafeTransferFrom on execution? Wait.)
        // In current model, tokens remain in Maker wallet until execution?
        // Let's check createOrder in WalletSwapMain.
        // It does NOT transfer tokens to contract. It just approves OrderProcessor? 
        // No, createOrder calls orderProcessor.createOrder. 
        // OrderProcessor calls AssetVerifier. 
        // AssetVerifier calls transferFrom? 
        // View AssetVerifier to be sure.
        
        // Actually, let's just assert delta.
        uint256 initMakerA = tokenA.balanceOf(maker);
        uint256 initMakerB = tokenB.balanceOf(maker);
        uint256 initTakerA = tokenA.balanceOf(taker);
        uint256 initTakerB = tokenB.balanceOf(taker);

        walletSwap.fulfillOrderPartial(orderId, fillAmount);
        
        vm.stopPrank();

        // Check balances
        // Maker loses 50 TokenA, gains 50 TokenB
        assertEq(tokenA.balanceOf(maker), initMakerA - 50 ether, "Maker A incorrect");
        assertEq(tokenB.balanceOf(maker), initMakerB + 50 ether, "Maker B incorrect");

        // Taker loses 50 TokenB, gains 50 TokenA
        assertEq(tokenA.balanceOf(taker), initTakerA + 50 ether, "Taker A incorrect");
        assertEq(tokenB.balanceOf(taker), initTakerB - 50 ether, "Taker B incorrect");

        // Check order status
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint(order.status), uint(EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED), "Status should be PARTIALLY_FILLED");
        assertEq(order.filledAmount, 50 ether, "Filled amount incorrect");
    }
}
