// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {WalletSwapMain} from "./WalletSwapMain.sol";
import {EulerLagrangeOrderProcessor} from "./EulerLagrangeOrderProcessor.sol";
import {VirtualLiquidityPool} from "./VirtualLiquidityPool.sol";

/**
 * @title InternalFeeConverter
 * @dev Converts ERC20 fees to native currency using the platform's own order matching
 * Creates internal conversion orders that match against existing liquidity
 * This creates a self-sustaining ecosystem where the platform handles its own conversions
 */
contract InternalFeeConverter is Ownable {
    using SafeERC20 for IERC20;

    // Component references
    WalletSwapMain public swapMain;
    EulerLagrangeOrderProcessor public orderProcessor;
    VirtualLiquidityPool public liquidityPool;

    // Pending conversion tracking
    struct ConversionOrder {
        address token;
        uint256 amount;
        uint256 estimatedNative;
        uint256 timestamp;
        bool filled;
        bool claimed;
    }

    mapping(bytes32 => ConversionOrder) public conversionOrders;
    bytes32[] public pendingConversionIds;

    // Configuration
    uint256 public conversionSlippage = 500; // 5% slippage tolerance
    uint256 public conversionDuration = 24 hours; // Order validity period
    uint256 public minConversionAmount = 1 * 10 ** 6; // $1 minimum (6 decimals)

    // Events
    event ConversionOrderCreated(
        bytes32 indexed orderId,
        address indexed token,
        uint256 amount,
        uint256 estimatedNative,
        uint256 timestamp
    );
    event ConversionOrderFilled(
        bytes32 indexed orderId,
        uint256 nativeReceived,
        uint256 timestamp
    );
    event ConversionOrderClaimed(
        bytes32 indexed orderId,
        address indexed recipient,
        uint256 amount
    );
    event ConversionOrderCancelled(
        bytes32 indexed orderId,
        string reason
    );
    event ConfigurationUpdated(
        uint256 slippage,
        uint256 duration,
        uint256 minAmount
    );

    constructor(
        address _swapMain,
        address _orderProcessor,
        address _liquidityPool
    ) {
        require(_swapMain != address(0), "Invalid swap main");
        require(_orderProcessor != address(0), "Invalid order processor");
        require(_liquidityPool != address(0), "Invalid liquidity pool");

        swapMain = WalletSwapMain(payable(_swapMain));
        orderProcessor = EulerLagrangeOrderProcessor(_orderProcessor);
        liquidityPool = VirtualLiquidityPool(_liquidityPool);
    }

    /**
     * @dev Create internal conversion order: ERC20 → Native
     * @param token Token to convert
     * @param amount Amount to convert
     * @return orderId Order ID for tracking
     */
    function createConversionOrder(
        address token,
        uint256 amount
    ) external returns (bytes32 orderId) {
        require(token != address(0), "Cannot convert native token");
        require(amount >= minConversionAmount, "Amount below minimum");

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Get quote for conversion
        uint256 estimatedNative = liquidityPool.getQuote(
            token,
            address(0),
            amount
        );

        // Apply slippage tolerance
        uint256 minNativeOut = (estimatedNative * (10000 - conversionSlippage)) / 10000;

        // Approve swap contract
        IERC20(token).safeApprove(address(swapMain), amount);

        // Create order on platform
        orderId = swapMain.createOrder(
            token,                      // tokenIn
            address(0),                 // tokenOut (native)
            WalletSwapMain.AssetType.ERC20,  // typeIn
            WalletSwapMain.AssetType.ERC20,  // typeOut
            amount,                     // amountIn
            minNativeOut,               // amountOut
            amount,                     // minutesValueIn (simplified)
            estimatedNative,            // minutesValueOut
            conversionSlippage,         // slippageTolerance
            conversionDuration,         // duration
            false,                      // rebooking disabled
            block.chainid               // same chain
        );

        // Track conversion
        conversionOrders[orderId] = ConversionOrder({
            token: token,
            amount: amount,
            estimatedNative: estimatedNative,
            timestamp: block.timestamp,
            filled: false,
            claimed: false
        });

        pendingConversionIds.push(orderId);

        emit ConversionOrderCreated(
            orderId,
            token,
            amount,
            estimatedNative,
            block.timestamp
        );

        return orderId;
    }

    /**
     * @dev Check and claim filled conversion orders
     * Can be called by anyone to process filled orders
     * @param orderId Order ID to check
     * @return nativeReceived Amount of native currency received (0 if not filled)
     */
    function checkAndClaim(bytes32 orderId) external returns (uint256 nativeReceived) {
        ConversionOrder storage conv = conversionOrders[orderId];
        require(conv.timestamp > 0, "Order not found");
        require(!conv.claimed, "Already claimed");

        // Check order status
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);

        if (order.status == EulerLagrangeOrderProcessor.OrderStatus.FILLED) {
            // Mark as filled and claimed
            conv.filled = true;
            conv.claimed = true;

            // Native tokens should already be in this contract from order fulfillment
            nativeReceived = order.amountOut;

            emit ConversionOrderFilled(orderId, nativeReceived, block.timestamp);
            emit ConversionOrderClaimed(orderId, msg.sender, nativeReceived);

            return nativeReceived;
        }

        return 0;
    }

    /**
     * @dev Batch check and claim multiple orders
     * @param orderIds Array of order IDs to process
     * @return totalNative Total native currency received
     */
    function batchCheckAndClaim(bytes32[] calldata orderIds) 
        external 
        returns (uint256 totalNative) 
    {
        for (uint256 i = 0; i < orderIds.length; i++) {
            try this.checkAndClaim(orderIds[i]) returns (uint256 received) {
                totalNative += received;
            } catch {
                // Skip failed claims
                continue;
            }
        }
        return totalNative;
    }

    /**
     * @dev Cancel unfilled conversion order and refund tokens
     * @param orderId Order ID to cancel
     */
    function cancelConversion(bytes32 orderId) external onlyOwner {
        ConversionOrder storage conv = conversionOrders[orderId];
        require(conv.timestamp > 0, "Order not found");
        require(!conv.filled, "Order already filled");
        require(!conv.claimed, "Order already claimed");

        // Check if order expired
        require(
            block.timestamp >= conv.timestamp + conversionDuration,
            "Order not expired yet"
        );

        // Cancel order on platform
        swapMain.cancelOrder(orderId);

        // Mark as claimed to prevent double-processing
        conv.claimed = true;

        emit ConversionOrderCancelled(orderId, "Expired and cancelled");
    }

    /**
     * @dev Get pending conversion count
     * @return count Number of pending conversions
     */
    function getPendingCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < pendingConversionIds.length; i++) {
            bytes32 orderId = pendingConversionIds[i];
            ConversionOrder memory conv = conversionOrders[orderId];
            if (!conv.filled && !conv.claimed) {
                count++;
            }
        }
        return count;
    }

    /**
     * @dev Get unfilled conversion orders older than a threshold
     * @param maxAge Maximum age in seconds
     * @return orderIds Array of expired order IDs
     */
    function getExpiredOrders(uint256 maxAge) 
        external 
        view 
        returns (bytes32[] memory orderIds) 
    {
        uint256 count = 0;
        
        // Count expired orders
        for (uint256 i = 0; i < pendingConversionIds.length; i++) {
            bytes32 orderId = pendingConversionIds[i];
            ConversionOrder memory conv = conversionOrders[orderId];
            
            if (!conv.filled && 
                !conv.claimed && 
                block.timestamp >= conv.timestamp + maxAge) {
                count++;
            }
        }

        // Collect expired order IDs
        orderIds = new bytes32[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < pendingConversionIds.length; i++) {
            bytes32 orderId = pendingConversionIds[i];
            ConversionOrder memory conv = conversionOrders[orderId];
            
            if (!conv.filled && 
                !conv.claimed && 
                block.timestamp >= conv.timestamp + maxAge) {
                orderIds[index] = orderId;
                index++;
            }
        }

        return orderIds;
    }

    /**
     * @dev Update configuration parameters
     * @param _slippage New slippage tolerance (basis points)
     * @param _duration New order duration
     * @param _minAmount New minimum conversion amount
     */
    function updateConfiguration(
        uint256 _slippage,
        uint256 _duration,
        uint256 _minAmount
    ) external onlyOwner {
        require(_slippage <= 1000, "Slippage too high"); // Max 10%
        require(_duration >= 1 hours, "Duration too short");
        require(_duration <= 7 days, "Duration too long");

        conversionSlippage = _slippage;
        conversionDuration = _duration;
        minConversionAmount = _minAmount;

        emit ConfigurationUpdated(_slippage, _duration, _minAmount);
    }

    /**
     * @dev Withdraw accumulated native currency
     * @param recipient Recipient address
     */
    function withdrawNative(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success,) = recipient.call{value: balance}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Emergency token recovery
     * @param token Token to recover
     * @param recipient Recipient address
     */
    function emergencyRecoverToken(address token, address recipient) 
        external 
        onlyOwner 
    {
        require(recipient != address(0), "Invalid recipient");
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to recover");

        IERC20(token).safeTransfer(recipient, balance);
    }

    /**
     * @dev Receive function to accept native tokens from order fills
     */
    receive() external payable {}
}
