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

    // C-6: Authorized contracts that can modify liquidity
    mapping(address => bool) public authorizedCallers;

    // Historical liquidity changes for rate calculations — M-3: Circular buffer
    struct LiquidityUpdate {
        uint256 liquidity;
        uint256 timestamp;
    }

    uint256 public constant HISTORY_SIZE = 10;
    // M-3: Circular buffer storage
    mapping(address => mapping(address => LiquidityUpdate[HISTORY_SIZE])) public liquidityHistory;
    mapping(address => mapping(address => uint256)) public historyHead; // Points to next write position
    mapping(address => mapping(address => uint256)) public historyCount; // Total entries written (capped at HISTORY_SIZE for reads)

    // Euler-Lagrange smoothness parameter (scaled by 1e18)
    uint256 public lambda = 5 * 10 ** 17; // 0.5

    // Events - Reactive Network compliant
    event LiquidityChanged(address indexed token0, address indexed token1, uint256 newLiquidity, uint256 timestamp);
    event OptimalFillCalculated(address indexed token0, address indexed token1, uint256 amount, uint256 optimalFill);
    event LiquidityPoolInitialized(address indexed owner);
    event AuthorizedCallerSet(address indexed caller, bool authorized);

    // C-6: Modifier for authorized callers
    modifier onlyAuthorized() {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Unauthorized caller");
        _;
    }

    constructor() {
        emit LiquidityPoolInitialized(msg.sender);
    }

    /**
     * @dev Set authorized caller status
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether the caller is authorized
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerSet(caller, authorized);
    }

    /**
     * @dev Initialize or update virtual liquidity for a pair
     * @param token0 First token
     * @param token1 Second token
     * @param amount Liquidity amount (in minutes valuation)
     */
    function updateVirtualLiquidity(address token0, address token1, uint256 amount) external onlyOwner {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);
        virtualLiquidity[tokenA][tokenB] = amount;
        _recordLiquidityUpdate(tokenA, tokenB, amount);
        emit LiquidityChanged(tokenA, tokenB, amount, block.timestamp);
    }

    /**
     * @dev Reduce liquidity after a swap — C-6: restricted to authorized callers
     * @param token0 First token
     * @param token1 Second token
     * @param amount Amount to reduce (in minutes valuation)
     */
    function reduceLiquidity(address token0, address token1, uint256 amount) external nonReentrant onlyAuthorized {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);

        uint256 currentLiquidity = virtualLiquidity[tokenA][tokenB];
        uint256 actualReduction = amount > currentLiquidity ? currentLiquidity : amount;
        
        if (actualReduction == 0) {
            return;
        }

        uint256 newLiquidity = currentLiquidity - actualReduction;
        virtualLiquidity[tokenA][tokenB] = newLiquidity;
        _recordLiquidityUpdate(tokenA, tokenB, newLiquidity);
        emit LiquidityChanged(tokenA, tokenB, newLiquidity, block.timestamp);
    }

    /**
     * @dev Add liquidity after a new order — C-6: restricted to authorized callers
     * @param token0 First token
     * @param token1 Second token
     * @param amount Amount to add (in minutes valuation)
     */
    function addLiquidity(address token0, address token1, uint256 amount) external nonReentrant onlyAuthorized {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);

        uint256 newLiquidity = virtualLiquidity[tokenA][tokenB] + amount;
        virtualLiquidity[tokenA][tokenB] = newLiquidity;
        _recordLiquidityUpdate(tokenA, tokenB, newLiquidity);
        emit LiquidityChanged(tokenA, tokenB, newLiquidity, block.timestamp);
    }

    /**
     * @dev Record liquidity update in history — M-3: O(1) circular buffer
     */
    function _recordLiquidityUpdate(address token0, address token1, uint256 amount) internal {
        uint256 head = historyHead[token0][token1];
        liquidityHistory[token0][token1][head] = LiquidityUpdate({liquidity: amount, timestamp: block.timestamp});
        historyHead[token0][token1] = (head + 1) % HISTORY_SIZE;
        
        uint256 count = historyCount[token0][token1];
        if (count < HISTORY_SIZE) {
            historyCount[token0][token1] = count + 1;
        }
    }

    /**
     * @dev Calculate liquidity change rate
     */
    function getLiquidityChangeRate(address token0, address token1) public view returns (int256) {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);
        uint256 count = historyCount[tokenA][tokenB];
        
        if (count < 2) {
            return 0;
        }

        uint256 head = historyHead[tokenA][tokenB];
        // Most recent is at (head - 1) mod HISTORY_SIZE, previous at (head - 2) mod HISTORY_SIZE
        uint256 recentIdx = (head + HISTORY_SIZE - 1) % HISTORY_SIZE;
        uint256 previousIdx = (head + HISTORY_SIZE - 2) % HISTORY_SIZE;

        LiquidityUpdate storage recent = liquidityHistory[tokenA][tokenB][recentIdx];
        LiquidityUpdate storage previous = liquidityHistory[tokenA][tokenB][previousIdx];

        uint256 timeDelta = recent.timestamp - previous.timestamp;
        if (timeDelta == 0) {
            return 0;
        }

        int256 liquidityDelta = int256(recent.liquidity) - int256(previous.liquidity);
        return liquidityDelta / int256(timeDelta);
    }

    /**
     * @dev Calculate optimal fill amount using adaptive Euler-Lagrange
     */
    function calculateOptimalFill(address token0, address token1, uint256 orderSize) external view returns (uint256) {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);
        uint256 currentLiquidity = virtualLiquidity[tokenA][tokenB];

        if (currentLiquidity == 0) {
            return 0;
        }

        int256 rateOfChange = getLiquidityChangeRate(tokenA, tokenB);

        uint256 absRateOfChange;
        if (rateOfChange < 0) {
            absRateOfChange = uint256(-rateOfChange);
        } else {
            absRateOfChange = uint256(rateOfChange);
        }

        uint256 optimalFill;
        if (absRateOfChange == 0) {
            optimalFill = currentLiquidity;
        } else {
            optimalFill = (currentLiquidity * lambda) / (lambda + absRateOfChange);
        }

        if (optimalFill > orderSize) {
            optimalFill = orderSize;
        }
        if (optimalFill > currentLiquidity) {
            optimalFill = currentLiquidity;
        }

        return optimalFill;
    }

    /**
     * @dev Update lambda parameter
     */
    function setLambda(uint256 _lambda) external onlyOwner {
        require(_lambda > 0, "Lambda must be positive");
        lambda = _lambda;
    }

    /**
     * @dev Helper to sort tokens for canonical representation
     */
    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        return tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /**
     * @dev Get available liquidity for a token pair
     */
    function getAvailableLiquidity(address token0, address token1) external view returns (uint256) {
        (address tokenA, address tokenB) = _sortTokens(token0, token1);
        return virtualLiquidity[tokenA][tokenB];
    }
}
