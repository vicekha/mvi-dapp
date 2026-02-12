// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BridgeSwapMain
 * @notice Bridge-pattern swap handler with User-Provided Liquidity (LP).
 *         Allows users to provide liquidity and facilitates cross-chain swaps.
 */
contract BridgeSwapMain is Ownable {
    using SafeERC20 for IERC20;

    address public authorizedRVM;
    
    // Mapping: LP Provider -> Token -> Balance
    mapping(address => mapping(address => uint256)) public lpBalances;
    // Total liquidity per token in the vault
    mapping(address => uint256) public totalLiquidity;

    event BridgeSwapRequested(
        bytes32 indexed orderId,
        address indexed maker,
        uint256 indexed targetChainId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 timestamp
    );

    event BridgeSwapExecuted(
        bytes32 indexed orderId,
        address indexed beneficiary,
        address tokenOut,
        uint256 amountOut,
        uint256 timestamp
    );

    event LiquidityProvided(address indexed lp, address indexed token, uint256 amount);
    event LiquidityWithdrawn(address indexed lp, address indexed token, uint256 amount);

    constructor(address _authorizedRVM) {
        authorizedRVM = _authorizedRVM;
    }

    function setAuthorizedRVM(address _rvm) external onlyOwner {
        authorizedRVM = _rvm;
    }

    /**
     * @notice Provide liquidity to the bridge to earn from swaps.
     */
    function provideLiquidity(address token, uint256 amount) external payable {
        if (token == address(0)) {
            require(msg.value > 0, "Zero ETH sent");
            lpBalances[msg.sender][address(0)] += msg.value;
            totalLiquidity[address(0)] += msg.value;
            emit LiquidityProvided(msg.sender, address(0), msg.value);
        } else {
            require(amount > 0, "Zero amount");
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            lpBalances[msg.sender][token] += amount;
            totalLiquidity[token] += amount;
            emit LiquidityProvided(msg.sender, token, amount);
        }
    }

    /**
     * @notice Withdraw liquidity from the bridge.
     */
    function withdrawLiquidity(address token, uint256 amount) external {
        require(lpBalances[msg.sender][token] >= amount, "Insufficient LP balance");
        require(totalLiquidity[token] >= amount, "Insufficient vault liquidity");

        lpBalances[msg.sender][token] -= amount;
        totalLiquidity[token] -= amount;

        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "ETH withdrawal failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit LiquidityWithdrawn(msg.sender, token, amount);
    }

    /**
     * @notice Initiate a cross-chain swap by locking tokens.
     * @dev Simple AMM logic: Locks asset here, triggers payout from LP pool on target chain.
     */
    function initiateSwap(
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 targetChainId
    ) external payable returns (bytes32) {
        require(amountIn > 0, "Invalid amount");
        
        if (tokenIn == address(0)) {
            require(msg.value >= amountIn, "Insufficient ETH sent");
        } else {
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        // IMPORTANT: The locked "tokenIn" essentially becomes new liquidity for LPs on THIS chain.
        // For simplicity in this demo, we can just track it as protocol liquidity or distribute it.
        // Real implementations would update LP index/shares here.
        totalLiquidity[tokenIn] += amountIn;

        bytes32 orderId = keccak256(abi.encodePacked(msg.sender, tokenIn, tokenOut, amountIn, targetChainId, block.timestamp));

        emit BridgeSwapRequested(
            orderId,
            msg.sender,
            targetChainId,
            tokenIn,
            tokenOut,
            amountIn,
            block.timestamp
        );

        return orderId;
    }

    /**
     * @notice Execute a payout for a cross-chain swap using LP funds.
     */
    function executePayout(
        bytes32 orderId,
        address beneficiary,
        address tokenOut,
        uint256 amountOut
    ) external {
        require(msg.sender == authorizedRVM || authorizedRVM == address(0), "Unauthorized");
        require(totalLiquidity[tokenOut] >= amountOut, "Insufficient liquidity in destination pool");

        totalLiquidity[tokenOut] -= amountOut;

        if (tokenOut == address(0)) {
            (bool success, ) = payable(beneficiary).call{value: amountOut}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(tokenOut).safeTransfer(beneficiary, amountOut);
        }

        emit BridgeSwapExecuted(orderId, beneficiary, tokenOut, amountOut, block.timestamp);
    }

    receive() external payable {}
}
