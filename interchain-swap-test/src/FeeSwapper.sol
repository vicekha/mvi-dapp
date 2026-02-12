// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

contract FeeSwapper is Ownable {
    using SafeERC20 for IERC20;

    ISwapRouter public swapRouter;
    address public wnative;

    uint24 public constant POOL_FEE_TIER = 3000; // 0.3%

    event SwapFailed(address indexed tokenIn, uint256 amountIn, string reason);
    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    constructor(address _swapRouter, address _wnative) {
        swapRouter = ISwapRouter(_swapRouter);
        wnative = _wnative;
    }

    function swapTokenForNative(address tokenIn, uint256 amountIn) external returns (uint256 amountOut) {
        if (address(swapRouter) == address(0)) {
            // Mock mode: Just burn token and pretend?
            // Or revert?
            // For Lasna testing without Uniswap, maybe return 0?
            return 0;
        }

        // Approve router
        IERC20(tokenIn).safeIncreaseAllowance(address(swapRouter), amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: wnative,
            fee: POOL_FEE_TIER,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        try swapRouter.exactInputSingle(params) returns (uint256 out) {
            // Unwrap WNative
            IWETH(wnative).withdraw(out);
            // Send Native to sender (HybridConverter)
            (bool sent,) = msg.sender.call{value: out}("");
            require(sent, "Native transfer failed");

            emit Swapped(tokenIn, wnative, amountIn, out);
            return out;
        } catch Error(string memory reason) {
            emit SwapFailed(tokenIn, amountIn, reason);
            return 0;
        } catch {
            emit SwapFailed(tokenIn, amountIn, "Unknown error");
            return 0;
        }
    }

    // Receive Native (from WETH withdraw)
    receive() external payable {}
}
