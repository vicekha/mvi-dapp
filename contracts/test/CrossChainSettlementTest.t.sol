// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/EulerLagrangeOrderProcessor.sol";

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
        walletSwap.executeInterChainOrder(rvm, orderId, simpleBeneficiary, 1 ether);

        // 3. Verify Settlement
        assertEq(simpleBeneficiary.balance, 1 ether);
        
        // Order should be marked as FILLED
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        assertEq(uint(order.status), 1); // FILLED = 1
    }
}
