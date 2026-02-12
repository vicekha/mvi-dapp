// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {InternalFeeConverter} from "./InternalFeeConverter.sol";
import "./FeeSwapper.sol";

/**
 * @title HybridFeeConverter
 * @dev Intelligent fee converter that tries platform-internal conversion first,
 * then falls back to Uniswap if the order doesn't fill within a timeout period
 * 
 * Strategy:
 * 1. Create internal conversion order on platform
 * 2. Wait for fallback period (e.g., 1 hour)
 * 3. If not filled, cancel and use Uniswap
 * 4. Track success rates and adjust strategy
 */
contract HybridFeeConverter is Ownable {
    using SafeERC20 for IERC20;

    // Component references
    InternalFeeConverter public internalConverter;
    FeeSwapper public feeSwapper;

    // Hybrid conversion tracking
    struct HybridConversion {
        address token;
        uint256 amount;
        bytes32 internalOrderId;
        uint256 createdAt;
        bool filled;
        bool fallbackUsed;
        uint256 nativeReceived;
        ConversionMethod method;
    }

    enum ConversionMethod {
        PENDING,
        INTERNAL,
        UNISWAP,
        FAILED
    }

    mapping(bytes32 => HybridConversion) public conversions;
    bytes32[] public conversionIds;

    // Configuration
    uint256 public fallbackTimeout = 1 hours; // Wait time before using Uniswap
    bool public preferInternal = true; // Prefer platform over Uniswap
    bool public autoFallback = true; // Automatically trigger fallback

    // Statistics for strategy optimization
    uint256 public totalConversions;
    uint256 public internalSuccesses;
    uint256 public uniswapFallbacks;
    uint256 public totalNativeConverted;

    // Events
    event HybridConversionStarted(
        bytes32 indexed conversionId,
        address indexed token,
        uint256 amount,
        bytes32 internalOrderId
    );
    event InternalConversionFilled(
        bytes32 indexed conversionId,
        uint256 nativeReceived
    );
    event FallbackTriggered(
        bytes32 indexed conversionId,
        string reason
    );
    event UniswapConversionCompleted(
        bytes32 indexed conversionId,
        uint256 nativeReceived
    );
    event ConversionFailed(
        bytes32 indexed conversionId,
        string reason
    );
    event ConfigurationUpdated(
        uint256 fallbackTimeout,
        bool preferInternal,
        bool autoFallback
    );

    constructor(
        address _internalConverter,
        address _feeSwapper
    ) {
        require(_internalConverter != address(0), "Invalid internal converter");
        
        internalConverter = InternalFeeConverter(_internalConverter);
        
        if (_feeSwapper != address(0)) {
            feeSwapper = FeeSwapper(_feeSwapper);
        }
    }

    /**
     * @dev Convert fee token to native using hybrid approach
     * @param token Token to convert
     * @param amount Amount to convert
     * @return conversionId Unique ID for tracking
     */
    function convertToNative(
        address token,
        uint256 amount
    ) external returns (bytes32 conversionId) {
        require(token != address(0), "Cannot convert native");
        require(amount > 0, "Amount must be greater than 0");

        // Transfer tokens from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Generate unique conversion ID
        conversionId = keccak256(abi.encodePacked(
            token,
            amount,
            block.timestamp,
            totalConversions
        ));

        totalConversions++;

        // Try internal conversion first (if preferred and available)
        if (preferInternal) {
            // Approve internal converter
            IERC20(token).safeApprove(address(internalConverter), amount);

            try internalConverter.createConversionOrder(token, amount) returns (bytes32 orderId) {
                // Track hybrid conversion
                conversions[conversionId] = HybridConversion({
                    token: token,
                    amount: amount,
                    internalOrderId: orderId,
                    createdAt: block.timestamp,
                    filled: false,
                    fallbackUsed: false,
                    nativeReceived: 0,
                    method: ConversionMethod.PENDING
                });

                conversionIds.push(conversionId);

                emit HybridConversionStarted(
                    conversionId,
                    token,
                    amount,
                    orderId
                );

                return conversionId;
            } catch {
                // Internal conversion failed, try Uniswap immediately
                return _convertViaUniswap(conversionId, token, amount);
            }
        } else {
            // Skip internal, go straight to Uniswap
            return _convertViaUniswap(conversionId, token, amount);
        }
    }

    /**
     * @dev Check conversion status and trigger fallback if needed
     * @param conversionId Conversion ID to check
     * @return completed Whether conversion is complete
     */
    function checkConversion(bytes32 conversionId) 
        external 
        returns (bool completed) 
    {
        HybridConversion storage conv = conversions[conversionId];
        require(conv.createdAt > 0, "Conversion not found");

        if (conv.filled) {
            return true;
        }

        // Check if internal order filled
        if (conv.internalOrderId != bytes32(0)) {
            try internalConverter.checkAndClaim(conv.internalOrderId) returns (uint256 nativeReceived) {
                if (nativeReceived > 0) {
                    // Internal conversion succeeded
                    conv.filled = true;
                    conv.nativeReceived = nativeReceived;
                    conv.method = ConversionMethod.INTERNAL;

                    internalSuccesses++;
                    totalNativeConverted += nativeReceived;

                    emit InternalConversionFilled(conversionId, nativeReceived);
                    return true;
                }
            } catch {
                // Check claim failed, continue
            }
        }

        // Check if fallback timeout reached
        if (autoFallback && 
            block.timestamp >= conv.createdAt + fallbackTimeout &&
            !conv.fallbackUsed) {
            
            return _triggerFallback(conversionId);
        }

        return false;
    }

    /**
     * @dev Manually trigger fallback to Uniswap
     * @param conversionId Conversion ID
     * @return success Whether fallback succeeded
     */
    function triggerFallback(bytes32 conversionId) 
        external 
        onlyOwner 
        returns (bool) 
    {
        return _triggerFallback(conversionId);
    }

    /**
     * @dev Internal fallback trigger
     */
    function _triggerFallback(bytes32 conversionId) internal returns (bool) {
        HybridConversion storage conv = conversions[conversionId];
        require(conv.createdAt > 0, "Conversion not found");
        require(!conv.filled, "Already filled");
        require(!conv.fallbackUsed, "Fallback already used");

        emit FallbackTriggered(conversionId, "Timeout reached");

        // Cancel internal order if it exists
        if (conv.internalOrderId != bytes32(0)) {
            try internalConverter.cancelConversion(conv.internalOrderId) {
                // Cancellation successful
            } catch {
                // Cancellation failed, tokens might be locked
            }
        }

        // Try Uniswap conversion
        if (address(feeSwapper) != address(0)) {
            try this._convertViaUniswapInternal(
                conversionId,
                conv.token,
                conv.amount
            ) returns (bool success) {
                return success;
            } catch {
                conv.method = ConversionMethod.FAILED;
                emit ConversionFailed(conversionId, "Uniswap conversion failed");
                return false;
            }
        } else {
            conv.method = ConversionMethod.FAILED;
            emit ConversionFailed(conversionId, "No Uniswap fallback available");
            return false;
        }
    }

    /**
     * @dev Convert via Uniswap (new conversion)
     */
    function _convertViaUniswap(
        bytes32 conversionId,
        address token,
        uint256 amount
    ) internal returns (bytes32) {
        require(address(feeSwapper) != address(0), "FeeSwapper not set");

        // Approve swapper
        IERC20(token).safeApprove(address(feeSwapper), amount);

        // Calculate minimum amount out
        uint256 minAmountOut = feeSwapper.calculateMinAmountOut(token, amount);

        // Perform swap
        uint256 nativeReceived = feeSwapper.swapToNativeFor(
            token,
            amount,
            address(this),
            minAmountOut
        );

        // Track conversion
        conversions[conversionId] = HybridConversion({
            token: token,
            amount: amount,
            internalOrderId: bytes32(0),
            createdAt: block.timestamp,
            filled: true,
            fallbackUsed: false,
            nativeReceived: nativeReceived,
            method: ConversionMethod.UNISWAP
        });

        conversionIds.push(conversionId);
        totalConversions++;
        uniswapFallbacks++;
        totalNativeConverted += nativeReceived;

        emit UniswapConversionCompleted(conversionId, nativeReceived);

        return conversionId;
    }

    /**
     * @dev External wrapper for Uniswap conversion (for try-catch)
     */
    function _convertViaUniswapInternal(
        bytes32 conversionId,
        address token,
        uint256 amount
    ) external returns (bool) {
        require(msg.sender == address(this), "Only self");

        HybridConversion storage conv = conversions[conversionId];

        // Approve swapper
        IERC20(token).safeApprove(address(feeSwapper), amount);

        // Calculate minimum amount out
        uint256 minAmountOut = feeSwapper.calculateMinAmountOut(token, amount);

        // Perform swap
        uint256 nativeReceived = feeSwapper.swapToNativeFor(
            token,
            amount,
            address(this),
            minAmountOut
        );

        conv.filled = true;
        conv.fallbackUsed = true;
        conv.nativeReceived = nativeReceived;
        conv.method = ConversionMethod.UNISWAP;

        uniswapFallbacks++;
        totalNativeConverted += nativeReceived;

        emit UniswapConversionCompleted(conversionId, nativeReceived);

        return true;
    }

    /**
     * @dev Batch check multiple conversions
     * @param conversionIds Array of conversion IDs
     * @return completedCount Number of completed conversions
     */
    function batchCheck(bytes32[] calldata conversionIds) 
        external 
        returns (uint256 completedCount) 
    {
        for (uint256 i = 0; i < conversionIds.length; i++) {
            try this.checkConversion(conversionIds[i]) returns (bool completed) {
                if (completed) {
                    completedCount++;
                }
            } catch {
                continue;
            }
        }
        return completedCount;
    }

    /**
     * @dev Get pending conversions that need fallback check
     * @return pending Array of pending conversion IDs
     */
    function getPendingConversions() 
        external 
        view 
        returns (bytes32[] memory pending) 
    {
        uint256 count = 0;
        
        // Count pending
        for (uint256 i = 0; i < conversionIds.length; i++) {
            HybridConversion memory conv = conversions[conversionIds[i]];
            if (!conv.filled && !conv.fallbackUsed) {
                count++;
            }
        }

        // Collect pending IDs
        pending = new bytes32[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < conversionIds.length; i++) {
            HybridConversion memory conv = conversions[conversionIds[i]];
            if (!conv.filled && !conv.fallbackUsed) {
                pending[index] = conversionIds[i];
                index++;
            }
        }

        return pending;
    }

    /**
     * @dev Get conversion statistics
     * @return stats Struct containing statistics
     */
    function getStatistics() external view returns (
        uint256 total,
        uint256 internalCount,
        uint256 uniswap,
        uint256 totalNative,
        uint256 internalRate
    ) {
        total = totalConversions;
        internalCount = internalSuccesses;
        uniswap = uniswapFallbacks;
        totalNative = totalNativeConverted;
        
        if (total > 0) {
            internalRate = (internalCount * 10000) / total; // Basis points
        }
        
        return (total, internalCount, uniswap, totalNative, internalRate);
    }

    /**
     * @dev Update configuration
     * @param _fallbackTimeout New fallback timeout
     * @param _preferInternal Whether to prefer internal conversion
     * @param _autoFallback Whether to auto-trigger fallback
     */
    function updateConfiguration(
        uint256 _fallbackTimeout,
        bool _preferInternal,
        bool _autoFallback
    ) external onlyOwner {
        require(_fallbackTimeout >= 10 minutes, "Timeout too short");
        require(_fallbackTimeout <= 7 days, "Timeout too long");

        fallbackTimeout = _fallbackTimeout;
        preferInternal = _preferInternal;
        autoFallback = _autoFallback;

        emit ConfigurationUpdated(_fallbackTimeout, _preferInternal, _autoFallback);
    }

    /**
     * @dev Set FeeSwapper address
     * @param _feeSwapper New FeeSwapper address
     */
    function setFeeSwapper(address _feeSwapper) external onlyOwner {
        require(_feeSwapper != address(0), "Invalid fee swapper");
        feeSwapper = FeeSwapper(_feeSwapper);
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
     * @dev Receive function to accept native tokens
     */
    receive() external payable {}
}
