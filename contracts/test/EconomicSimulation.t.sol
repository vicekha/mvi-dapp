// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/MockToken.sol";
import "./SimulationHandler.sol";

contract EconomicSimulation is Test {
    EulerLagrangeOrderProcessor public orderProcessor;
    WalletSwapMain public walletSwap;
    VirtualLiquidityPool public liquidityPool;
    AssetVerifier public assetVerifier;
    TrustWalletFeeDistributor public feeDistributor;
    MockToken public tokenA;
    MockToken public tokenB;
    SimulationHandler public handler;

    address public admin = address(0xAD);
    address public alice = address(0xAA);
    address public bob = address(0xBB);
    address public charlie = address(0xCC);

    function setUp() public {
        vm.startPrank(admin);
        liquidityPool = new VirtualLiquidityPool();
        feeDistributor = new TrustWalletFeeDistributor(admin);
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
        assetVerifier.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(orderProcessor), true);
        liquidityPool.setAuthorizedCaller(address(walletSwap), true);
        
        tokenA = new MockToken();
        tokenB = new MockToken();
        
        handler = new SimulationHandler(
            orderProcessor,
            walletSwap,
            tokenA,
            tokenB
        );

        tokenA.transferOwnership(address(handler));
        tokenB.transferOwnership(address(handler));
        
        handler.setupMakers();
        vm.stopPrank();

        // Give the test contract tokens and ETH for fees
        vm.deal(address(this), 100 ether);
        handler.mint(true, address(this), 10000 ether);
        handler.mint(false, address(this), 10000 ether);
        
        // No prank = address(this)
        tokenA.approve(address(walletSwap), type(uint256).max);
        tokenB.approve(address(walletSwap), type(uint256).max);
    }

    /**
     * @dev Scenario A: Market Sweep Efficiency
     * A large order should clear multiple smaller counter-orders in a single transaction.
     */
    function test_scenario_A_MarketSweepEfficiency() public {
        // Setup: Create 5 small orders (Bob, Charlie, etc.) providing Token B for Token A
        // Total B offered: 500, Total A wanted: 250 (Rate 2:1)
        for (uint256 i = 0; i < 5; i++) {
            address maker = address(uint160(i + 2000));
            vm.deal(maker, 10 ether);
            handler.mint(false, maker, 1000 ether); // tokenB is false
            vm.startPrank(maker);
            tokenB.approve(address(walletSwap), type(uint256).max);
            walletSwap.createOrder{value: 1 ether}(
                address(tokenB), address(tokenA),
                WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
                100 ether, 50 ether, // Rate 2:1
                100 ether, 50 ether,
                0, 1 days, true, 0
            );
            vm.stopPrank();
        }

        // Alice creates 1 large order: Providing 250 Token A for 500 Token B (Rate 1:2)
        // This should trigger a sweep of all 5 small orders
        vm.deal(alice, 10 ether);
        handler.mint(true, alice, 1000 ether);
        vm.startPrank(alice);
        tokenA.approve(address(walletSwap), type(uint256).max);
        
        uint256 balanceBeforeA = tokenA.balanceOf(alice);
        uint256 balanceBeforeB = tokenB.balanceOf(alice);
        
        bytes32 megaOrderId = walletSwap.createOrder{value: 1 ether}(
            address(tokenA), address(tokenB),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            250 ether, 500 ether,
            250 ether, 500 ether,
            0, 1 days, true, 0
        );
        vm.stopPrank();

        // Verification: Mega order should be completely filled
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(megaOrderId);
        assertEq(uint256(order.status), uint256(EulerLagrangeOrderProcessor.OrderStatus.FILLED), "Mega order not filled");
        assertEq(order.filledAmount, 500 ether, "Filled amount mismatch");
        
        // Alice should have lost 250 A and gained 500 B
        // Alice should have lost 250 A and gained 500 B (minus fee on TokenA)
        // Alice paid fee DISTRIBUTED in tokenA: calculateFee(tokenA, AliceType, 250 ether, 250 ether)
        uint256 feeAlice = feeDistributor.calculateFee(address(tokenA), TrustWalletFeeDistributor.AssetType.ERC20, 250 ether, 250 ether);
        assertEq(tokenA.balanceOf(alice), balanceBeforeA - 250 ether - feeAlice, "Alice TokenA balance error");
        assertEq(tokenB.balanceOf(alice), balanceBeforeB + 500 ether, "Alice TokenB balance error");
    }

    /**
     * @dev Scenario B: Rebooking Thresholds
     * Verify that "Mega" orders and "Large" orders use different thresholds.
     */
    function test_scenario_B_RebookingThresholds() public {
        uint256 currentTime = 1;
        vm.warp(currentTime);

        // 1. SMALL ORDER (Threshold 50%)
        // Create 20% filled small order
        vm.deal(address(this), 10 ether);
        bytes32 smallId = walletSwap.createOrder{value: 1 ether}(
            address(tokenA), address(tokenB),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            100 ether, 100 ether,
            100 ether, 100 ether,
            0, 1 hours, true, 0
        );
        // Partially fill 20%
        vm.prank(address(walletSwap));
        orderProcessor.updateOrderFill(smallId, 20 ether);
        
        // Expire and process
        currentTime += 2 hours;
        vm.warp(currentTime);
        bytes32[] memory batch = new bytes32[](1);
        batch[0] = smallId;
        vm.prank(admin);
        orderProcessor.processOrderBatch(batch);
        
        // Should be rebooked (20% < 50%)
        EulerLagrangeOrderProcessor.Order memory smallOrder = orderProcessor.getOrder(smallId);
        assertEq(uint256(smallOrder.status), uint256(EulerLagrangeOrderProcessor.OrderStatus.ACTIVE), "Small order should rebook");
        assertEq(smallOrder.rebookAttempts, 1, "Small rebook count wrong");

        // 2. LARGE ORDER (Threshold 90%)
        // MinutesValueIn = 600 ether ( > 500)
        bytes32 largeId = walletSwap.createOrder{value: 1 ether}(
            address(tokenA), address(tokenB),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            600 ether, 600 ether,
            600 ether, 600 ether,
            0, 1 hours, true, 0
        );
        // Partially fill 80% (Less than 90% threshold for Large)
        vm.prank(address(walletSwap));
        orderProcessor.updateOrderFill(largeId, 480 ether);
        
        currentTime += 2 hours;
        vm.warp(currentTime);
        batch[0] = largeId;
        vm.prank(admin);
        orderProcessor.processOrderBatch(batch);
        
        // Should be rebooked (80% < 90%)
        EulerLagrangeOrderProcessor.Order memory largeOrder = orderProcessor.getOrder(largeId);
        assertEq(uint256(largeOrder.status), uint256(EulerLagrangeOrderProcessor.OrderStatus.ACTIVE), "Large order should rebook at 80%");

        // 3. MEGA ORDER (Threshold 10%)
        // MinutesValueIn = 1100 ether ( > 1000)
        bytes32 megaId = walletSwap.createOrder{value: 1 ether}(
            address(tokenA), address(tokenB),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            1100 ether, 1100 ether,
            1100 ether, 1100 ether,
            0, 1 hours, true, 0
        );
        // Partially fill 15% (Greater than 10% threshold for Mega)
        vm.prank(address(walletSwap));
        orderProcessor.updateOrderFill(megaId, 165 ether);
        
        currentTime += 2 hours;
        vm.warp(currentTime);
        batch[0] = megaId;
        vm.prank(admin);
        orderProcessor.processOrderBatch(batch);
        
        // Should be FILLED (15% >= 10%)
        EulerLagrangeOrderProcessor.Order memory megaOrder = orderProcessor.getOrder(megaId);
        assertEq(uint256(megaOrder.status), uint256(EulerLagrangeOrderProcessor.OrderStatus.FILLED), "Mega order should stop at 15%");
    }

    /**
     * @dev Scenario C: Slippage Robustness
     * Test matching at the very edge of slippage tolerance.
     */
    function test_scenario_C_SlippageRobustness() public {
        // Alice wants 100 B for 100 A (1:1), 1% slippage (min 99 B)
        bytes32 idA = walletSwap.createOrder{value: 1 ether}(
            address(tokenA), address(tokenB),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            100 ether, 100 ether,
            100 ether, 100 ether,
            100, // 1%
            1 days, true, 0
        );

        // Bob offers 98.5 B for 100 A (Worse than 1% slippage)
        bytes32 idB_fail = walletSwap.createOrder{value: 1 ether}(
            address(tokenB), address(tokenA),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            98.5 ether, 100 ether,
            98.5 ether, 100_000, // Minimal amount out to pass B check
            0, 1 days, true, 0
        );
        
        // Attempt manual match - should fail
        vm.prank(admin);
        vm.expectRevert("Amount mismatch (A)");
        walletSwap.matchOrders(idA, idB_fail);

        // Bob offers 99.1 B for 100 A (Better than 1% slippage)
        bytes32 idB_pass = walletSwap.createOrder{value: 1 ether}(
            address(tokenB), address(tokenA),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            99.1 ether, 100 ether,
            99.1 ether, 100_000,
            0, 1 days, true, 0
        );
        
        // Attempt manual match - should pass
        vm.prank(admin);
        walletSwap.matchOrders(idA, idB_pass);
        
        // Alice's order should be partially filled (99.1 / 100)
        assertEq(uint256(orderProcessor.getOrder(idA).status), uint256(EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED));
        assertEq(orderProcessor.getOrder(idA).filledAmount, 99.1 ether);
    }
}
