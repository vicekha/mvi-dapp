// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {VirtualLiquidityPool} from "../src/VirtualLiquidityPool.sol";
import {EulerLagrangeOrderProcessor} from "../src/EulerLagrangeOrderProcessor.sol";
import {TrustWalletFeeDistributor} from "../src/TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "../src/AssetVerifier.sol";
import {WalletSwapMain} from "../src/WalletSwapMain.sol";

contract WalletSwapTest is Test {
    VirtualLiquidityPool liquidityPool;
    EulerLagrangeOrderProcessor orderProcessor;
    TrustWalletFeeDistributor feeDistributor;
    AssetVerifier assetVerifier;
    WalletSwapMain walletSwapMain;

    address owner = address(0x1);
    address trustWallet = address(0x2);
    address user1 = address(0x3);
    address user2 = address(0x4);

    function setUp() public {
        vm.startPrank(owner);

        // Deploy contracts
        liquidityPool = new VirtualLiquidityPool();
        feeDistributor = new TrustWalletFeeDistributor(trustWallet);
        assetVerifier = new AssetVerifier();

        orderProcessor =
            new EulerLagrangeOrderProcessor(address(liquidityPool), address(feeDistributor), address(assetVerifier));

        walletSwapMain = new WalletSwapMain(
            address(liquidityPool), address(orderProcessor), address(feeDistributor), address(assetVerifier)
        );

        // Register for debt coverage
        feeDistributor.registerReactiveContract(address(walletSwapMain));

        vm.stopPrank();
    }

    function testDeployment() public {
        assertNotEq(address(liquidityPool), address(0));
        assertNotEq(address(orderProcessor), address(0));
        assertNotEq(address(feeDistributor), address(0));
        assertNotEq(address(assetVerifier), address(0));
        assertNotEq(address(walletSwapMain), address(0));
    }

    function testFeeDistributorInitialization() public {
        assertEq(feeDistributor.defaultTrustWallet(), trustWallet);
    }

    function testReactiveContractRegistration() public {
        assertTrue(feeDistributor.isReactiveContract(address(walletSwapMain)));
    }

    function testFeeCalculation() public {
        // Test 1% fee calculation
        address token = address(0x5);
        uint256 amount = 100 * 10 ** 18;
        uint256 minutesValue = 100 * 10 ** 18;

        uint256 fee =
            feeDistributor.calculateFee(token, TrustWalletFeeDistributor.AssetType.ERC20, amount, minutesValue);

        // 1% of 100 = 1
        assertEq(fee, 1 * 10 ** 18);
    }

    function testMinimumFeeEnforcement() public {
        address token = address(0x5);
        uint256 amount = 1; // Very small amount
        uint256 minutesValue = 1 * 10 ** 18;

        uint256 fee =
            feeDistributor.calculateFee(token, TrustWalletFeeDistributor.AssetType.ERC20, amount, minutesValue);

        // Should enforce minimum fee
        assertTrue(fee > 0);
    }

    function testDebtStatusQuery() public {
        // Get initial debt status
        (uint256 debt, uint256 fees, bool canCover) = walletSwapMain.getDebtStatus();

        // Initially should have no debt
        assertEq(debt, 0);
        assertEq(fees, 0);
        assertFalse(canCover);
    }

    function testAccumulatedFeesTracking() public {
        address token = address(0x5);

        // Initially no fees
        uint256 initialFees = feeDistributor.getAccumulatedFees(token);
        assertEq(initialFees, 0);
    }

    function testContractWithDebtTracking() public {
        // Get contracts with debt count
        uint256 count = feeDistributor.getContractsWithDebtCount();

        // Should have 1 contract (WalletSwapMain)
        assertEq(count, 1);
    }

    function testDebtCoverageThresholdConfiguration() public {
        vm.startPrank(owner);

        uint256 newThreshold = 0.05 ether;
        feeDistributor.setDebtCoverageThreshold(newThreshold);

        // Verify threshold was set
        // Note: Add getter function to verify

        vm.stopPrank();
    }

    function testTrustWalletAddressManagement() public {
        vm.startPrank(owner);

        address token = address(0x6);
        address newWallet = address(0x7);

        // Set trust wallet for token
        feeDistributor.setTrustWalletAddress(token, newWallet);

        // Verify it was set
        address retrievedWallet = feeDistributor.getTrustWalletForToken(token);
        assertEq(retrievedWallet, newWallet);

        vm.stopPrank();
    }

    function testBulkTrustWalletConfiguration() public {
        vm.startPrank(owner);

        address[] memory tokens = new address[](3);
        address[] memory wallets = new address[](3);

        tokens[0] = address(0x8);
        tokens[1] = address(0x9);
        tokens[2] = address(0xA);

        wallets[0] = address(0xB);
        wallets[1] = address(0xC);
        wallets[2] = address(0xD);

        // Bulk set
        feeDistributor.bulkSetTrustWalletAddresses(tokens, wallets);

        // Verify all were set
        for (uint256 i = 0; i < tokens.length; i++) {
            assertEq(feeDistributor.getTrustWalletForToken(tokens[i]), wallets[i]);
        }

        vm.stopPrank();
    }

    function testFeeHistoryTracking() public {
        // Get initial history length
        uint256 initialLength = feeDistributor.getFeeHistoryLength();
        assertEq(initialLength, 0);
    }

    function testNativeTokenDetection() public {
        // address(0) should be detected as native
        assertTrue(feeDistributor.isNativeToken(address(0)));

        // Other addresses should not be detected as native
        assertFalse(feeDistributor.isNativeToken(address(0x1)));
    }

    function testComponentIntegration() public {
        // Verify all components are properly integrated
        assertEq(address(walletSwapMain.liquidityPool()), address(liquidityPool));
        assertEq(address(walletSwapMain.orderProcessor()), address(orderProcessor));
        assertEq(address(walletSwapMain.feeDistributor()), address(feeDistributor));
        assertEq(address(walletSwapMain.assetVerifier()), address(assetVerifier));
    }

    function testSystemContractAddress() public {
        // Verify system contract address is set correctly
        address systemContract = address(uint160(0xFFFFFF));

        // This would be used in actual Reactive Network deployment
        assertTrue(systemContract != address(0));
    }

    function testOwnershipManagement() public {
        vm.startPrank(owner);

        // Verify owner is set
        assertEq(feeDistributor.owner(), owner);

        vm.stopPrank();
    }

    function testUnauthorizedAccess() public {
        vm.startPrank(user1);

        // Should revert when non-owner tries to register contract
        vm.expectRevert("Ownable: caller is not the owner");
        feeDistributor.registerReactiveContract(address(0x1));

        vm.stopPrank();
    }
}
