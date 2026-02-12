// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Uniswap V3 Router Interface (simplified)
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

// WETH9 Interface
interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/**
 * @title FeeSwapper
 * @dev Automatically converts ERC20 fee tokens to native currency using Uniswap V3
 * This allows users to pay fees in the token they're swapping (better UX)
 * while still collecting native currency for Reactive Network debt coverage
 */
contract FeeSwapper is Ownable {
    using SafeERC20 for IERC20;

    // Configuration
    address public immutable swapRouter;
    address public immutable WETH9;
    uint24 public defaultPoolFee = 3000; // 0.3% pool fee
    uint256 public minSwapAmount = 0.001 ether; // Minimum amount to swap (avoid dust)
    uint256 public maxSlippage = 500; // 5% max slippage (in basis points)

    // Token-specific pool fees (some tokens may use different pools)
    mapping(address => uint24) public tokenPoolFees;

    // Events
    event FeeSwapped(
        address indexed token, uint256 amountIn, uint256 amountOut, uint256 timestamp
    );
    event PoolFeeUpdated(address indexed token, uint24 fee);
    event MinSwapAmountUpdated(uint256 newAmount);
    event MaxSlippageUpdated(uint256 newSlippage);

    constructor(address _swapRouter, address _weth9) {
        require(_swapRouter != address(0), "Invalid swap router");
        require(_weth9 != address(0), "Invalid WETH9");
        
        swapRouter = _swapRouter;
        WETH9 = _weth9;
    }

    /**
     * @dev Swap ERC20 tokens to native currency
     * @param token Token to swap
     * @param amount Amount to swap
     * @param minAmountOut Minimum native currency to receive (slippage protection)
     * @return amountOut Amount of native currency received
     */
    function swapToNative(
        address token,
        uint256 amount,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        require(token != address(0), "Cannot swap native token");
        require(amount > 0, "Amount must be greater than 0");
        require(amount >= minSwapAmount, "Amount below minimum");

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve router to spend tokens
        IERC20(token).safeApprove(swapRouter, amount);

        // Determine pool fee to use
        uint24 poolFee = tokenPoolFees[token];
        if (poolFee == 0) {
            poolFee = defaultPoolFee;
        }

        // Swap token -> WETH
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: token,
            tokenOut: WETH9,
            fee: poolFee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0 // No price limit
        });

        amountOut = ISwapRouter(swapRouter).exactInputSingle(params);

        // Unwrap WETH to native ETH
        IWETH9(WETH9).withdraw(amountOut);

        // Transfer native currency to sender
        (bool success,) = msg.sender.call{value: amountOut}("");
        require(success, "Native transfer failed");

        emit FeeSwapped(token, amount, amountOut, block.timestamp);

        return amountOut;
    }

    /**
     * @dev Swap ERC20 tokens to native currency and send to specific recipient
     * Used by FeeDistributor for automated conversions
     * @param token Token to swap
     * @param amount Amount to swap
     * @param recipient Recipient of native currency
     * @param minAmountOut Minimum native currency to receive
     * @return amountOut Amount of native currency received
     */
    function swapToNativeFor(
        address token,
        uint256 amount,
        address recipient,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        require(token != address(0), "Cannot swap native token");
        require(amount > 0, "Amount must be greater than 0");
        require(recipient != address(0), "Invalid recipient");

        // Skip swap if amount is too small
        if (amount < minSwapAmount) {
            return 0;
        }

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve router
        IERC20(token).safeApprove(swapRouter, amount);

        // Determine pool fee
        uint24 poolFee = tokenPoolFees[token];
        if (poolFee == 0) {
            poolFee = defaultPoolFee;
        }

        // Swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: token,
            tokenOut: WETH9,
            fee: poolFee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });

        amountOut = ISwapRouter(swapRouter).exactInputSingle(params);

        // Unwrap WETH
        IWETH9(WETH9).withdraw(amountOut);

        // Send to recipient
        (bool success,) = recipient.call{value: amountOut}("");
        require(success, "Native transfer failed");

        emit FeeSwapped(token, amount, amountOut, block.timestamp);

        return amountOut;
    }

    /**
     * @dev Calculate minimum amount out with slippage protection
     * @param token Token to swap
     * @param amountIn Amount to swap
     * @return minAmountOut Minimum amount to receive
     */
    function calculateMinAmountOut(
        address token,
        uint256 amountIn
    ) external view returns (uint256 minAmountOut) {
        // In production, this should use a price oracle (Chainlink, Uniswap TWAP, etc.)
        // For now, apply max slippage to a 1:1 ratio
        // This is a simplified version - you should integrate price feeds
        
        // Placeholder: assume 1:1 ratio minus max slippage
        minAmountOut = (amountIn * (10000 - maxSlippage)) / 10000;
        
        return minAmountOut;
    }

    /**
     * @dev Set pool fee for a specific token
     * @param token Token address
     * @param fee Pool fee (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
     */
    function setTokenPoolFee(address token, uint24 fee) external onlyOwner {
        require(fee == 500 || fee == 3000 || fee == 10000, "Invalid pool fee");
        tokenPoolFees[token] = fee;
        emit PoolFeeUpdated(token, fee);
    }

    /**
     * @dev Set default pool fee
     * @param fee New default pool fee
     */
    function setDefaultPoolFee(uint24 fee) external onlyOwner {
        require(fee == 500 || fee == 3000 || fee == 10000, "Invalid pool fee");
        defaultPoolFee = fee;
    }

    /**
     * @dev Set minimum swap amount
     * @param amount New minimum amount
     */
    function setMinSwapAmount(uint256 amount) external onlyOwner {
        minSwapAmount = amount;
        emit MinSwapAmountUpdated(amount);
    }

    /**
     * @dev Set maximum slippage tolerance
     * @param slippage New max slippage in basis points
     */
    function setMaxSlippage(uint256 slippage) external onlyOwner {
        require(slippage <= 1000, "Slippage too high"); // Max 10%
        maxSlippage = slippage;
        emit MaxSlippageUpdated(slippage);
    }

    /**
     * @dev Emergency withdraw stuck tokens
     * @param token Token to withdraw
     * @param to Recipient
     */
    function emergencyWithdraw(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        
        if (token == address(0)) {
            (bool success,) = to.call{value: address(this).balance}("");
            require(success, "Transfer failed");
        } else {
            uint256 balance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransfer(to, balance);
        }
    }

    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}
