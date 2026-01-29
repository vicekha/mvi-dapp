// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {VirtualLiquidityPool} from "../src/VirtualLiquidityPool.sol";
import {EulerLagrangeOrderProcessor} from "../src/EulerLagrangeOrderProcessor.sol";
import {TrustWalletFeeDistributor} from "../src/TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "../src/AssetVerifier.sol";
import {WalletSwapMain} from "../src/WalletSwapMain.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

    contract WhitelistRemovalTest is Test {
        VirtualLiquidityPool liquidityPool;
        EulerLagrangeOrderProcessor orderProcessor;
        TrustWalletFeeDistributor feeDistributor;
        AssetVerifier assetVerifier;
        WalletSwapMain walletSwapMain;
        MockERC20 tokenIn;
        MockERC20 tokenOut;

        address owner = address(0x1);
        address user = address(0x2);
        address trustWallet = address(0x3);

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

            // Setup component links
            orderProcessor.setWalletSwapMain(address(walletSwapMain));

            // Deploy tokens
            tokenIn = new MockERC20();
            tokenOut = new MockERC20();

            vm.stopPrank();

            // Mint tokens to user
            tokenIn.mint(user, 1000 * 10 ** 18);
            tokenOut.mint(user, 1000 * 10 ** 18);
        }

        function testCreateOrderWithoutWhitelist() public {
            vm.startPrank(user);

            uint256 amountIn = 100 * 10 ** 18;
            uint256 amountOut = 90 * 10 ** 18;
            uint256 minutesValueIn = amountIn; // Simple 1:1
            uint256 minutesValueOut = amountOut;

            // Approve contracts
            tokenIn.approve(address(feeDistributor), amountIn); // Fee might be taken
            tokenIn.approve(address(walletSwapMain), amountIn);

            // Calculate fee to send
            // Fee is taken in native token if tokenIn is address(0), otherwise in tokenIn often?
            // Let's check WalletSwapMain.createOrder:
            // fee = feeDistributor.calculateFee(...)
            // if tokenIn != address(0) ... msg.value >= (tokenIn==0? amountIn : 0) ? fee : msg.value
            // It seems feeDistributor.distributeFee takes fee in Native if msg.value is sent, or token?
            // Actually distributeFee implementation is in TrustWalletFeeDistributor, but looking at WalletSwapMain:
            // distributeFee{value: ...}
            // If typeIn is ERC20, usually fee is collected in keys or separately.
            // Let's assume we send enough ETH for gas/fee if needed.

            // Ensure user has some ETH
            vm.deal(user, 10 ether);

            // Create order
            bytes32 orderId = walletSwapMain.createOrder{value: 0}(
                address(tokenIn),
                address(tokenOut),
                WalletSwapMain.AssetType.ERC20,
                WalletSwapMain.AssetType.ERC20,
                amountIn,
                amountOut,
                minutesValueIn,
                minutesValueOut,
                500, // slippage
                3600, // duration
                false, // rebooking
                0 // target chain
            );

            assertTrue(orderId != bytes32(0), "Order ID should not be zero");

            // Verify order exists in processor
            EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
            assertEq(order.maker, user);
            assertEq(order.tokenIn, address(tokenIn));
            assertEq(order.tokenOut, address(tokenOut));

            vm.stopPrank();
        }
    }
