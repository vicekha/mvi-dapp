// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/WalletSwapMain.sol";
import "../src/TrustWalletFeeDistributor.sol";
import "../src/VirtualLiquidityPool.sol";
import "../src/AssetVerifier.sol";
import "../src/EulerLagrangeOrderProcessor.sol";

// Mock System Contract to simulate Debt
contract MockSystemContract {
    mapping(address => uint256) public debts;
    mapping(address => uint256) public deposits;

    function setDebt(address _contract, uint256 _amount) external {
        debts[_contract] = _amount;
    }

    function depositTo(address _contract) external payable {
        if (msg.value >= debts[_contract]) {
            debts[_contract] = 0;
        } else {
            debts[_contract] -= msg.value;
        }
        deposits[_contract] += msg.value;
    }
}

contract GasFeeDebtCoverageTest is Test {
    WalletSwapMain walletSwap;
    TrustWalletFeeDistributor feeDistributor;
    VirtualLiquidityPool liquidityPool;
    AssetVerifier assetVerifier;
    EulerLagrangeOrderProcessor orderProcessor;
    MockSystemContract systemContract;

    address user = address(0x123);
    address token = address(0x456); // Mock ERC20

    address constant SYSTEM_CONTRACT_ADDR = address(uint160(0xFFFFFF));

    function setUp() public {
        // Deploy Mock System Contract at the specific address
        systemContract = new MockSystemContract();
        vm.etch(SYSTEM_CONTRACT_ADDR, address(systemContract).code);

        // Deploy Core
        liquidityPool = new VirtualLiquidityPool();
        assetVerifier = new AssetVerifier();
        feeDistributor = new TrustWalletFeeDistributor(address(0x999)); // Default trust wallet
        orderProcessor = new EulerLagrangeOrderProcessor(address(liquidityPool), address(feeDistributor), address(assetVerifier));
        walletSwap = new WalletSwapMain(address(liquidityPool), address(orderProcessor), address(feeDistributor), address(assetVerifier));

        orderProcessor.setWalletSwapMain(address(walletSwap));
        
        // Register WalletSwapMain for debt coverage
        feeDistributor.registerReactiveContract(address(walletSwap));
        
        // Fund user
        vm.deal(user, 100 ether);
    }

    function testRevert_CreateOrderNoGas() public {
        vm.prank(user);
        vm.expectRevert(bytes("Insufficient native sent (Amount + Fee + Gas)"));
        walletSwap.createOrder(
            address(0), address(0), 
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            1 ether, 1 ether, 0, 0, 0, 3600, false, 80002
        );
    }

    function testCreateOrderWithGas() public {
        uint256 gasFee = walletSwap.MIN_GAS_FEE();
        uint256 amount = 1 ether;
        
        // Calculate fee (assumes minimal fee logic in mock or 0.05%)
        // We are using native tokenIn, so value must be amount + fee + gas
        uint256 fee = feeDistributor.calculateFee(address(0), TrustWalletFeeDistributor.AssetType.ERC20, amount, 0);
        
        vm.prank(user);
        walletSwap.createOrder{value: amount + fee + gasFee}(
            address(0), address(0), 
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            1 ether, 1 ether, 100, 100, 0, 3600, false, 80002
        );
        
        // User balance should decrease
        // FeeDistributor should have received gasFee (accumulated)
        // Wait, accumulatedFees[address(0)] should increase
        assertGe(feeDistributor.accumulatedFees(address(0)), gasFee);
    }

    function testDebtCoverage() public {
        // 1. Set Debt for WalletSwapMain in Mock System Contract
        uint256 debtAmount = 0.001 ether;
        MockSystemContract(SYSTEM_CONTRACT_ADDR).setDebt(address(walletSwap), debtAmount);
        
        assertEq(MockSystemContract(SYSTEM_CONTRACT_ADDR).debts(address(walletSwap)), debtAmount);

        // 2. Create Order with Gas
        uint256 gasFee = walletSwap.MIN_GAS_FEE(); // 0.002 > 0.001
        
        // Ensure gasFee covers debt
        assertTrue(gasFee > debtAmount);

        vm.prank(user);
        uint256 amount = 0.1 ether;
        uint256 fee = feeDistributor.calculateFee(address(0), TrustWalletFeeDistributor.AssetType.ERC20, amount, 0);

        walletSwap.createOrder{value: amount + fee + gasFee}(
            address(0), address(0), 
            WalletSwapMain.AssetType.ERC20, WalletSwapMain.AssetType.ERC20,
            amount, 0.1 ether, 100, 100, 0, 3600, false, 80002
        );

        // 3. Check if Debt was paid
        // The MockSystemContract deposits[walletSwap] should increase
        // The MockSystemContract debts[walletSwap] should be 0
        assertEq(MockSystemContract(SYSTEM_CONTRACT_ADDR).debts(address(walletSwap)), 0);
        
        // debtsCovered in FeeDistributor should update
        assertEq(feeDistributor.debtsCovered(address(walletSwap)), debtAmount);
    }
}
