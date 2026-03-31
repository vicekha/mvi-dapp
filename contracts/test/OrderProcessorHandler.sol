// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/MockToken.sol";

contract OrderProcessorHandler is Test {
    EulerLagrangeOrderProcessor public orderProcessor;
    WalletSwapMain public walletSwap;
    VirtualLiquidityPool public liquidityPool;
    AssetVerifier public assetVerifier;
    MockToken public tokenA;
    MockToken public tokenB;

    address[] public makers;
    bytes32[] public activeOrders;
    
    // Ghost variables
    mapping(address => mapping(address => uint256)) public ghost_liquidity;
    uint256 public ghost_orderCount;

    constructor(
        EulerLagrangeOrderProcessor _orderProcessor,
        WalletSwapMain _walletSwap,
        VirtualLiquidityPool _liquidityPool,
        AssetVerifier _assetVerifier,
        MockToken _tokenA,
        MockToken _tokenB
    ) {
        orderProcessor = _orderProcessor;
        walletSwap = _walletSwap;
        liquidityPool = _liquidityPool;
        assetVerifier = _assetVerifier;
        tokenA = _tokenA;
        tokenB = _tokenB;

        for (uint160 i = 1; i <= 5; i++) {
            address maker = address(i + 100);
            makers.push(maker);
        }
    }

    function setupMakers() public {
        for (uint256 i = 0; i < makers.length; i++) {
            address maker = makers[i];
            vm.deal(maker, 100 ether);
            tokenA.mint(maker, 1000 ether);
            tokenB.mint(maker, 1000 ether);
            
            vm.startPrank(maker);
            tokenA.approve(address(walletSwap), type(uint256).max);
            tokenB.approve(address(walletSwap), type(uint256).max);
            vm.stopPrank();
        }
    }

    function createOrder(
        uint256 makerIndex,
        bool useTokenA,
        uint256 amountIn,
        uint256 amountOut,
        uint256 expirationDelta
    ) public {
        address maker = makers[makerIndex % makers.length];
        amountIn = bound(amountIn, 1e6, 10 ether);
        amountOut = bound(amountOut, 1e6, 100 ether);
        expirationDelta = bound(expirationDelta, 60, 1 days);

        address tIn = useTokenA ? address(tokenA) : address(tokenB);
        address tOut = useTokenA ? address(tokenB) : address(tokenA);

        vm.startPrank(maker);
        bytes32 orderId = walletSwap.createOrder{value: 1 ether}(
            tIn,
            tOut,
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC20,
            amountIn,
            amountOut,
            amountIn, // minutesValueIn
            amountOut, // minutesValueOut
            100, // slippage
            expirationDelta, // duration
            true, // enableRebooking
            0 // same chain
        );
        vm.stopPrank();

        activeOrders.push(orderId);
        ghost_liquidity[tIn][tOut] += amountIn;
        ghost_orderCount++;
    }

    function cancelOrder(uint256 orderIndex) public {
        if (activeOrders.length == 0) return;
        uint256 idx = orderIndex % activeOrders.length;
        bytes32 orderId = activeOrders[idx];
        
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        if (order.status != EulerLagrangeOrderProcessor.OrderStatus.ACTIVE && 
            order.status != EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED) {
            return;
        }

        vm.prank(order.maker);
        orderProcessor.cancelOrder(orderId);

        // Update ghost liquidity
        uint256 remainingValue = order.minutesValueIn - ((order.filledAmount * order.minutesValueIn) / (order.amountOut == 0 ? 1 : order.amountOut));
        ghost_liquidity[order.tokenIn][order.tokenOut] -= remainingValue;
        
        // Remove from active orders
        activeOrders[idx] = activeOrders[activeOrders.length - 1];
        activeOrders.pop();
    }

    function matchOrders(uint256 orderIndexA, uint256 orderIndexB) public {
        if (activeOrders.length < 2) return;
        bytes32 idA = activeOrders[orderIndexA % activeOrders.length];
        bytes32 idB = activeOrders[orderIndexB % activeOrders.length];
        if (idA == idB) return;

        EulerLagrangeOrderProcessor.Order memory orderA = orderProcessor.getOrder(idA);
        EulerLagrangeOrderProcessor.Order memory orderB = orderProcessor.getOrder(idB);

        if (orderA.tokenIn == orderB.tokenOut && orderA.tokenOut == orderB.tokenIn) {
            try walletSwap.matchOrders(idA, idB) {
                _checkAndRemoveIfFilled(idA);
                _checkAndRemoveIfFilled(idB);
            } catch {}
        }
    }

    function _checkAndRemoveIfFilled(bytes32 orderId) internal {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId); // BUG: id vs orderId
        if (order.status == EulerLagrangeOrderProcessor.OrderStatus.FILLED) {
            for (uint256 i = 0; i < activeOrders.length; i++) {
                if (activeOrders[i] == orderId) {
                    activeOrders[i] = activeOrders[activeOrders.length - 1];
                    activeOrders.pop();
                    break;
                }
            }
        }
    }

    function warpTime(uint256 secondsToWarp) public {
        secondsToWarp = bound(secondsToWarp, 1, 1 weeks);
        vm.warp(block.timestamp + secondsToWarp);
    }
}
