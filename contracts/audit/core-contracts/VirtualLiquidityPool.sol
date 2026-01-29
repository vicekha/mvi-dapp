// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title VirtualLiquidityPool
 * @dev Manages virtual liquidity for time-based token valuations
 * Reactive Network Compliant - Emits events for cross-chain synchronization
 */
contract VirtualLiquidityPool is Ownable, ReentrancyGuard {
    // Pair liquidity mapping (token0 => token1 => liquidity)
    mapping(address => mapping(address => uint256)) public virtualLiquidity;

    // Historical liquidity changes for rate calculations
    struct LiquidityUpdate {
        uint256 liquidity;
        uint256 timestamp;
    }

    // Last 10 liquidity updates per pair
    mapping(address => mapping(address => LiquidityUpdate[])) public liquidityHistory;

    // Euler-Lagrange smoothness parameter (scaled by 1e18)
    uint256 public lambda = 5 * 10 ** 17; // 0.5

    // Events - Reactive Network compliant
    event LiquidityChanged(address indexed token0, address indexed token1, uint256 newLiquidity, uint256 timestamp);
    event OptimalFillCalculated(address indexed token0, address indexed token1, uint256 amount, uint256 optimalFill);
    event LiquidityPoolInitialized(address indexed owner);

    constructor() {
        emit LiquidityPoolInitialized(msg.sender);
    }

    /**
     * @dev Initialize or update virtual liquidity for a pair
     * @param token0 First token
     * @param token1 Second token
     * @param amount Liquidity amount (in minutes valuation)
     */
    function updateVirtualLiquidity(address token0, address token1, uint256 amount) external onlyOwner {
        // Ensure canonical token ordering
        (address tokenA, address tokenB) = _sortTokens(token0, token1);

        // Update virtual liquidity
        virtualLiquidity[tokenA][tokenB] = amount;

        // Record historical update
        _recordLiquidityUpdate(tokenA, tokenB, amount);

        emit LiquidityChanged(tokenA, tokenB, amount, block.timestamp);
    }

    /**
     * @dev Reduce liquidity after a swap
     * @param token0 First token
     * @param token1 Second token
     * @param amount Amount to reduce (in minutes valuation)
     */
    function reduceLiquidity(address token0, address token1, uint256 amount) external nonReentrant {
        // Ensure canonical token ordering
        (address tokenA, address tokenB) = _sortTokens(token0, token1);

        uint256 currentLiquidity = virtualLiquidity[tokenA][tokenB];
        
        // Cap reduction at available liquidity (graceful degradation for edge cases)
        // This handles cases like cancelling partially filled orders where liquidity 
        // may have already been reduced during partial fill execution
        uint256 actualReduction = amount > currentLiquidity ? currentLiquidity : amount;
        
        if (actualReduction == 0) {
            return; // Nothing to reduce
        }

        // Reduce virtual liquidity
        uint256 newLiquidity = currentLiquidity - actualReduction;
        virtualLiquidity[tokenA][tokenB] = newLiquidity;

        // Record historical update
        _recordLiquidityUpdate(tokenA, tokenB, newLiquidity);

        emit LiquidityChanged(tokenA, tokenB, newLiquidity, block.timestamp);
    }

    /**
     * @dev Add liquidity after a new order
     * @param token0 First token
     * @param token1 Second token
     * @param amount Amount to add (in minutes valuation)
     */
    function addLiquidity(address token0, address token1, uint256 amount) external nonReentrant {
        // Ensure canonical token ordering
        (address tokenA, address tokenB) = _sortTokens(token0, token1);

        // Add virtual liquidity
        uint256 newLiquidity = virtualLiquidity[tokenA][tokenB] + amount;
        virtualLiquidity[tokenA][tokenB] = newLiquidity;

        // Record historical update
        _recordLiquidityUpdate(tokenA, tokenB, newLiquidity);

        emit LiquidityChanged(tokenA, tokenB, newLiquidity, block.timestamp);
    }

    /**
     * @dev Record liquidity update in history
     * @param token0 First token
     * @param token1 Second token
     * @param amount New liquidity amount
     */
    function _recordLiquidityUpdate(address token0, address token1, uint256 amount) internal {
        LiquidityUpdate[] storage history = liquidityHistory[token0][token1];

        // Keep only latest 10 updates
        if (history.length >= 10) {
            // Shift array left, discarding oldest entry
            for (uint256 i = 0; i < 9; i++) {
                history[i] = history[i + 1];
            }
            history[9] = LiquidityUpdate({liquidity: amount, timestamp: block.timestamp});
        } else {
            history.push(LiquidityUpdate({liquidity: amount, timestamp: block.timestamp}));
        }
    }

    /**
     * @dev Calculate liquidity change rate
     * @param token0 First token
     * @param token1 Second token
     * @return rate Liquidity change rate (per second)
     */
    function getLiquidityChangeRate(address token0, address token1) public view returns (int256) {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);
        LiquidityUpdate[] storage history = liquidityHistory[tokenA][tokenB];

        if (history.length < 2) {
            return 0; // Not enough data points
        }

        // Use the two most recent data points
        LiquidityUpdate storage recent = history[history.length - 1];
        LiquidityUpdate storage previous = history[history.length - 2];

        uint256 timeDelta = recent.timestamp - previous.timestamp;
        if (timeDelta == 0) {
            return 0; // Avoid division by zero
        }

        // Calculate change rate (can be positive or negative)
        int256 liquidityDelta = int256(recent.liquidity) - int256(previous.liquidity);
        // forge-lint: disable-next-line(unsafe-typecast)
        return liquidityDelta / int256(timeDelta);
    }

    /**
     * @dev Calculate optimal fill amount using adaptive Euler-Lagrange
     * @param token0 First token
     * @param token1 Second token
     * @param orderSize Requested fill amount
     * @return optimalFill Optimal fill amount
     */
    function calculateOptimalFill(address token0, address token1, uint256 orderSize) external view returns (uint256) {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);

        // Get current virtual liquidity
        uint256 currentLiquidity = virtualLiquidity[tokenA][tokenB];

        // If no liquidity, return zero
        if (currentLiquidity == 0) {
            return 0;
        }

        // Get liquidity change rate
        int256 rateOfChange = getLiquidityChangeRate(tokenA, tokenB);

        // Convert to absolute value for calculation
        uint256 absRateOfChange;
        if (rateOfChange < 0) {
            // forge-lint: disable-next-line(unsafe-typecast)
            absRateOfChange = uint256(-rateOfChange);
        } else {
            // forge-lint: disable-next-line(unsafe-typecast)
            absRateOfChange = uint256(rateOfChange);
        }

        // Apply Euler-Lagrange formula: V(t) * (λ/(λ + |ΔV/Δt|))
        uint256 optimalFill;
        if (absRateOfChange == 0) {
            // No rate of change, can fill up to current liquidity
            optimalFill = currentLiquidity;
        } else {
            optimalFill = (currentLiquidity * lambda) / (lambda + absRateOfChange);
        }

        // Cap at order size
        if (optimalFill > orderSize) {
            optimalFill = orderSize;
        }

        // Cap at current liquidity
        if (optimalFill > currentLiquidity) {
            optimalFill = currentLiquidity;
        }

        // emit OptimalFillCalculated(tokenA, tokenB, orderSize, optimalFill);

        return optimalFill;
    }

    /**
     * @dev Update lambda parameter
     * @param _lambda New lambda value (scaled by 1e18)
     */
    function setLambda(uint256 _lambda) external onlyOwner {
        require(_lambda > 0, "Lambda must be positive");
        lambda = _lambda;
    }

    /**
     * @dev Helper to sort tokens for canonical representation
     * @param tokenA First token
     * @param tokenB Second token
     * @return token0 Lower token address
     * @return token1 Higher token address
     */
    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        return tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /**
     * @dev Get available liquidity for a token pair
     * @param token0 First token
     * @param token1 Second token
     * @return Available liquidity
     */
    function getAvailableLiquidity(address token0, address token1) external view returns (uint256) {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);
        return virtualLiquidity[tokenA][tokenB];
    }
}
