// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/WalletSwapMain.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/AssetVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {}
    
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}

contract MarketSweepTest is Test {
    VirtualLiquidityPool pool;
    EulerLagrangeOrderProcessor processor;
    WalletSwapMain walletSwap;
    TrustWalletFeeDistributor feeDistributor;
    AssetVerifier assetVerifier;

    MockToken tokenA; // 18 decimals
    MockToken tokenB; // 6 decimals (USDC-like)

    address user1 = address(0x1);
    address user2 = address(0x2);
    address sweeper = address(0x3);

    function setUp() public {
        tokenA = new MockToken("Token A", "TKA", 18);
        tokenB = new MockToken("Token B", "TKB", 6);

        pool = new VirtualLiquidityPool();
        assetVerifier = new AssetVerifier();
        feeDistributor = new TrustWalletFeeDistributor(address(this));
        
        processor = new EulerLagrangeOrderProcessor(
            address(pool),
            address(feeDistributor),
            address(assetVerifier)
        );

        walletSwap = new WalletSwapMain(
            address(pool),
            address(processor),
            address(feeDistributor),
            address(assetVerifier)
        );

        processor.setWalletSwapMain(address(walletSwap));

        // Authorize contracts in VirtualLiquidityPool
        pool.setAuthorizedCaller(address(processor), true);
        pool.setAuthorizedCaller(address(walletSwap), true);

        // Set minimum order value to 0 for testing
        processor.setMinimumOrderValue(0);
        
        // Mint tokens
        tokenB.mint(user1, 1000 * 10**6);
        tokenB.mint(user2, 1000 * 10**6);
        tokenA.mint(sweeper, 1000 * 10**18);

        // Approve
        vm.prank(user1);
        tokenB.approve(address(walletSwap), type(uint256).max);
        
        vm.prank(user2);
        tokenB.approve(address(walletSwap), type(uint256).max);
        
        vm.prank(sweeper);
        tokenA.approve(address(walletSwap), type(uint256).max);

        // Fund ETH for gas fees
        vm.deal(user1, 1 ether);
        vm.deal(user2, 1 ether);
        vm.deal(sweeper, 1 ether);
    }

    function testMarketSweep() public {
        // User 1: Sell 25 TokenB for 25 TokenA
        vm.prank(user1);
        bytes32 order1 = walletSwap.createOrder{value: 0.002 ether}(
            address(tokenB), address(tokenA),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            25 * 10**6, 25 * 10**18, // 25 USDC -> 25 TKA
            25, 25,
            5, 1 hours, false, 0
        );

        // User 2: Sell 50 TokenB for 50 TokenA
        vm.prank(user2);
        bytes32 order2 = walletSwap.createOrder{value: 0.002 ether}(
            address(tokenB), address(tokenA),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            50 * 10**6, 50 * 10**18, // 50 USDC -> 50 TKA
            50, 50,
            5, 1 hours, false, 0
        );

        // Sweeper: Sell 75 TokenA for 75 TokenB (Should fill both)
        vm.prank(sweeper);
        bytes32 sweepOrder = walletSwap.createOrder{value: 0.002 ether}(
            address(tokenA), address(tokenB),
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            75 * 10**18, 75 * 10**6, // 75 TKA -> 75 USDC
            75, 75,
            5, 1 hours, false, 0
        );

        // Verify Status
        EulerLagrangeOrderProcessor.Order memory o1 = processor.getOrder(order1);
        EulerLagrangeOrderProcessor.Order memory o2 = processor.getOrder(order2);
        EulerLagrangeOrderProcessor.Order memory s = processor.getOrder(sweepOrder);

        console.log("Order 1 Status (Expected 1/FILLED):", uint(o1.status));
        console.log("Order 2 Status (Expected 1/FILLED):", uint(o2.status));
        console.log("Sweep Order Status (Expected 1/FILLED):", uint(s.status));
        console.log("Sweep Filled Amount:", s.filledAmount);

        assertEq(uint(o1.status), uint(EulerLagrangeOrderProcessor.OrderStatus.FILLED), "Order 1 should be filled");
        assertEq(uint(o2.status), uint(EulerLagrangeOrderProcessor.OrderStatus.FILLED), "Order 2 should be filled");
        assertEq(uint(s.status), uint(EulerLagrangeOrderProcessor.OrderStatus.FILLED), "Sweep Order should be filled");

        // Verify Balances
        assertEq(tokenB.balanceOf(sweeper), 75 * 10**6, "Sweeper should have 75 TokenB");
        assertEq(tokenA.balanceOf(user1), 25 * 10**18, "User 1 should have 25 TokenA");
        assertEq(tokenA.balanceOf(user2), 50 * 10**18, "User 2 should have 50 TokenA");
    }
}
