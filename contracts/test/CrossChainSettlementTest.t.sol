// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";
import "../src/MockToken.sol";

contract CrossChainSettlementTest is Test {
    WalletSwapMain walletSwap;
    EulerLagrangeOrderProcessor orderProcessor;
    VirtualLiquidityPool liquidityPool;
    AssetVerifier assetVerifier;
    TrustWalletFeeDistributor feeDistributor;

    address maker = address(0x1);
    address beneficiary = address(0x2);
    address rvm = address(0x3);

    function setUp() public {
        liquidityPool = new VirtualLiquidityPool();
        feeDistributor = new TrustWalletFeeDistributor(payable(address(0x4)));
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
        walletSwap.setAuthorizedReactiveVM(rvm);
        walletSwap.setCallbackProxy(rvm);

        vm.deal(maker, 10 ether);
    }

    receive() external payable {}
    fallback() external payable {}

    function testCrossChainCallbackSettlement() public {
        // 1. Create an order on "Origin Chain"
        address realMaker = makeAddr("realMaker");
        address simpleBeneficiary = makeAddr("simpleBeneficiary");
        vm.deal(realMaker, 10 ether);

        vm.startPrank(realMaker);
        bytes32 orderId = walletSwap.createOrder{value: 1.1 ether}(
            address(0), // ETH in
            address(0xdead), // Some token out on other chain
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC20,
            1 ether,
            100 ether,
            1,
            1,
            100,
            3600,
            false,
            11155111 // Target Sepolia
        );
        vm.stopPrank();

        // Verify order is active (balance = 1.1 - 0.0005 fee = 1.0995 ETH)
        assertGe(address(walletSwap).balance, 1 ether);
        
        // 2. Simulate RSC Callback from Lasna
        vm.prank(rvm);
        walletSwap.executeInterChainOrder(address(0), rvm, orderId, simpleBeneficiary, 1 ether);

        // 3. Verify Settlement
        assertEq(simpleBeneficiary.balance, 1 ether);
        
        // Order should be marked as FILLED
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint(order.status), 1); // FILLED = 1
    }

    function testNativeToNativeSettlement() public {
        // This test simulates a Native-to-Native swap settlement.
        // User A (on this chain) wants to SELL Native Token (e.g., ETH) and BUY Native Token (e.g., BNB on other chain).
        // BUT wait, 'executeInterChainOrder' is called regarding an order that ALREADY EXISTS on this chain.
        // If I created an order to SELL ETH, 'executeInterChainOrder' means it was matched.
        // So I need to release my ETH to the beneficiary (who provided BNB on the other chain).
        
        address nativeMaker = makeAddr("nativeMaker");
        address bnbProvider = makeAddr("bnbProvider");
        
        vm.deal(nativeMaker, 10 ether);
        
        vm.startPrank(nativeMaker);
        bytes32 orderId = walletSwap.createOrder{value: 2.1 ether}(
            address(0), // TokenIn: ETH (Address 0)
            address(0), // TokenOut: BNB (Address 0 - represents Native on dest chain)
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC20,
            2 ether,    // AmountIn: 2 ETH
            10 ether,   // AmountOut: 10 BNB (hypothetical rate)
            1,
            1,
            100,
            3600,
            false,
            56 // Target Chain: BSC
        );
        vm.stopPrank();
        
        // Contract should hold the 2 ETH + fees
        assertGe(address(walletSwap).balance, 2 ether);
        
        // Simulate RSC Callback: 
        // "Order matched on BSC! Send the 2 ETH to 'bnbProvider' (who sent the BNB)"
        vm.prank(rvm);
        walletSwap.executeInterChainOrder(address(0), rvm, orderId, bnbProvider, 2 ether);
        
        // Verify 'bnbProvider' received 2 ETH
        assertEq(bnbProvider.balance, 2 ether);
        
        // Verify Order Status is FILLED
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint(order.status), 1); // FILLED = 1
    }

    function testPartialFillUnitMismatch() public {
        // Order: give 1 GWEI (1e9), want 1 ETH (1e18)
        address unitMaker = makeAddr("unitMaker");
        address unitTaker = makeAddr("unitTaker");
        vm.deal(unitMaker, 1 ether);
        
        vm.startPrank(unitMaker);
        bytes32 orderId = walletSwap.createOrder{value: 0.1 ether}(
            address(0), 
            address(0x123), 
            WalletSwapMain.AssetType.ERC20,
            WalletSwapMain.AssetType.ERC20,
            1e9,    // 1 GWEI
            1e18,   // 1 ETH
            1,
            1,
            100,
            3600,
            false,
            0 // Same chain
        );
        vm.stopPrank();

        // Now partially fill: Taker provides 0.5 ETH (5e17), should receive 0.5 GWEI (5e8)
        // In inter-chain callback simulation, amount is what maker releases (in units of tokenIn)
        vm.prank(rvm);
        walletSwap.executeInterChainOrder(address(0), rvm, orderId, unitTaker, 5e8); // release 0.5 GWEI
        
        assertEq(unitTaker.balance, 5e8);
        
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint(order.status), 2); // PARTIALLY_FILLED
        assertEq(order.filledAmount, 5e17); // Half of amountOut
    }

    function testMatchOrdersUnitMismatch() public {
        address makerA = makeAddr("makerA");
        address makerB = makeAddr("makerB");
        MockToken token = new MockToken();
        vm.deal(makerA, 1 ether);
        token.mint(makerB, 10 ether);

        // Order A: Give 1 GWEI ETH, want 1 Token
        vm.startPrank(makerA);
        bytes32 idA = walletSwap.createOrder{value: 0.1 ether}(
            address(0), 
            address(token), 
            WalletSwapMain.AssetType.ERC20, 
            WalletSwapMain.AssetType.ERC20, 
            1e8,    // 0.1 GWEI
            1e18,   // 1 Token
            1, 1, 100, 3600, false, 0
        );
        vm.stopPrank();

        // Order B: Give 1 Token, want 0.1 GWEI ETH (Compatible)
        vm.startPrank(makerB);
        token.approve(address(walletSwap), 1e18);
        token.approve(address(feeDistributor), 1e17);
        bytes32 idB = walletSwap.createOrder(
            address(token), 
            address(0), 
            WalletSwapMain.AssetType.ERC20, 
            WalletSwapMain.AssetType.ERC20, 
            1e18,   // 1 Token
            1e8,    // 0.1 GWEI
            1, 1, 100, 3600, false, 0
        );
        vm.stopPrank();

        // Check if already auto-matched (which uses _executeMatch internally)
        if (orderProcessor.getOrder(idA).status != EulerLagrangeOrderProcessor.OrderStatus.FILLED) {
            // Match them manually if not auto-matched
            walletSwap.matchOrders(idA, idB);
        }

        assertEq(token.balanceOf(makerA), 1e18); // A gets 1 Token
        assertEq(makerB.balance, 1e8);  // B gets 0.1 GWEI
        
        assertEq(uint(orderProcessor.getOrder(idA).status), 1); // Filled
        assertEq(uint(orderProcessor.getOrder(idB).status), 1); // Filled
    }
}
