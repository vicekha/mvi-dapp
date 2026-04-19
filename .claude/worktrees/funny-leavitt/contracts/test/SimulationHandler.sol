// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/MockToken.sol";

contract SimulationHandler is Test {
    EulerLagrangeOrderProcessor public orderProcessor;
    WalletSwapMain public walletSwap;
    MockToken public tokenA;
    MockToken public tokenB;

    address[] public makers;

    constructor(
        EulerLagrangeOrderProcessor _orderProcessor,
        WalletSwapMain _walletSwap,
        MockToken _tokenA,
        MockToken _tokenB
    ) {
        orderProcessor = _orderProcessor;
        walletSwap = _walletSwap;
        tokenA = _tokenA;
        tokenB = _tokenB;

        for (uint160 i = 1; i <= 10; i++) {
            makers.push(address(i + 1000));
        }
    }

    function setupMakers() public {
        for (uint256 i = 0; i < makers.length; i++) {
            address maker = makers[i];
            vm.deal(maker, 100 ether);
            tokenA.mint(maker, 10000 ether);
            tokenB.mint(maker, 10000 ether);
            
            vm.startPrank(maker);
            tokenA.approve(address(walletSwap), type(uint256).max);
            tokenB.approve(address(walletSwap), type(uint256).max);
            vm.stopPrank();
        }
    }

    function createStandardOrder(
        address maker,
        bool aToB,
        uint256 amountIn,
        uint256 amountOut,
        uint256 duration
    ) public returns (bytes32) {
        address tIn = aToB ? address(tokenA) : address(tokenB);
        address tOut = aToB ? address(tokenB) : address(tokenA);
        
        vm.prank(maker);
        return walletSwap.createOrder{value: 1 ether}(
            tIn,
            tOut,
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC20,
            amountIn,
            amountOut,
            amountIn, // minutesValueIn
            amountOut, // minutesValueOut
            100, // 1% slippage
            duration,
            true,
            0
        );
    }

    function mint(bool isA, address to, uint256 amount) public {
        if (isA) {
            tokenA.mint(to, amount);
        } else {
            tokenB.mint(to, amount);
        }
    }

    function createMegaOrder(
        address maker,
        bool aToB,
        uint256 amountIn,
        uint256 amountOut
    ) public returns (bytes32) {
        return createStandardOrder(maker, aToB, amountIn, amountOut, 1 days);
    }

    function batchCreateOrders(
        address maker,
        bool aToB,
        uint256 count,
        uint256 totalAmountIn,
        uint256 totalAmountOut
    ) public returns (bytes32[] memory) {
        bytes32[] memory ids = new bytes32[](count);
        uint256 amountPerIn = totalAmountIn / count;
        uint256 amountPerOut = totalAmountOut / count;

        for (uint256 i = 0; i < count; i++) {
            ids[i] = createStandardOrder(maker, aToB, amountPerIn, amountPerOut, 1 days);
        }
        return ids;
    }
}
