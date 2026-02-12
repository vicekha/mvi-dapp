// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HybridFeeConverter} from "./HybridFeeConverter.sol";

/**
 * @title TrustWalletFeeDistributorV3
 * @dev Final evolution of fee distributor with self-service conversion
 * Uses platform's own order matching (+ Uniswap fallback) to convert ERC20 fees to native
 * 
 * Key Features:
 * - Auto-converts ERC20 fees using hybrid approach
 * - Prefers internal platform liquidity
 * - Falls back to Uniswap if needed
 * - All fees accumulated as native for debt coverage
 */
contract TrustWalletFeeDistributorV3 is Ownable {
    using SafeERC20 for IERC20;

    // Asset type enum
    enum AssetType {
        ERC20,
        ERC721
    }

    // Reactive Network System Contract
    address public constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000fffFfF;

    // Component
    HybridFeeConverter public hybridConverter;

    // Trust Wallet configuration
    mapping(address => address) public trustWalletAddresses;
    address public defaultTrustWallet;

    // Fee parameters
    uint256 public constant FEE_RATE = 100; // 1% (in basis points)
    uint256 public constant MIN_FEE_MINUTES = 1 * 10 ** 18; // 1 minute (18 decimals)

    // Fee tracking
    struct FeeRecord {
        address token;
        uint256 amount;
        uint256 nativeAmount;
        bytes32 conversionId;
        uint256 timestamp;
        bytes32 orderId;
    }

    FeeRecord[] public feeHistory;

    // Debt coverage tracking
    mapping(address => uint256) public accumulatedFees; // Native fees only
    mapping(address => uint256) public debtsCovered;
    address[] public contractsWithDebt;

    // Configuration
    uint256 public debtCoverageThreshold = 0.01 ether;
    mapping(address => bool) public isReactiveContract;
    bool public autoConvertFees = true;
    uint256 public minConversionAmount = 1 * 10 ** 6; // $1 minimum

    // Pending conversions tracking
    mapping(bytes32 => bool) public pendingConversions;
    bytes32[] public pendingConversionIds;

    // Events
    event TrustWalletAddressSet(address indexed token, address wallet);
    event DefaultTrustWalletSet(address wallet);
    event FeeDistributed(
        address indexed token,
        uint256 amount,
        bytes32 indexed orderId,
        uint256 timestamp
    );
    event FeeConversionInitiated(
        address indexed token,
        uint256 amount,
        bytes32 indexed conversionId
    );
    event FeeConversionCompleted(
        bytes32 indexed conversionId,
        uint256 nativeAmount
    );
    event DebtCovered(address indexed reactiveContract, uint256 amount, uint256 timestamp);
    event FeeDistributorInitialized(address indexed owner);
    event ReactiveContractRegistered(address indexed contractAddr, bool isReactive);
    event HybridConverterUpdated(address indexed newConverter);
    event AutoConvertFeesUpdated(bool enabled);

    constructor(
        address _defaultTrustWallet,
        address _hybridConverter
    ) {
        require(_defaultTrustWallet != address(0), "Invalid default wallet");
        
        defaultTrustWallet = _defaultTrustWallet;
        
        if (_hybridConverter != address(0)) {
            hybridConverter = HybridFeeConverter(_hybridConverter);
        }
        
        emit FeeDistributorInitialized(msg.sender);
        emit DefaultTrustWalletSet(_defaultTrustWallet);
    }

    /**
     * @dev Calculate fee based on minutes-based valuation
     */
    function calculateFee(
        address,
        AssetType assetType,
        uint256 amount,
        uint256 minutesValuation
    )
        public
        pure
        returns (uint256)
    {
        // For NFTs, fee is based on minutes valuation
        if (assetType == AssetType.ERC721) {
            uint256 nftFeeInMinutes = (minutesValuation * FEE_RATE) / 10000;
            if (nftFeeInMinutes < MIN_FEE_MINUTES) {
                nftFeeInMinutes = MIN_FEE_MINUTES;
            }
            return nftFeeInMinutes;
        }

        // Calculate percentage-based fee for ERC20
        uint256 percentageFee = (amount * FEE_RATE) / 10000;

        // Calculate fee in minutes
        uint256 feeInMinutes = (minutesValuation * FEE_RATE) / 10000;

        // Ensure minimum fee in minutes
        if (minutesValuation > 0 && feeInMinutes < MIN_FEE_MINUTES) {
            uint256 minFeeRatio = (MIN_FEE_MINUTES * 10 ** 18) / minutesValuation;
            uint256 minFeeAmount = (amount * minFeeRatio) / 10 ** 18;

            if (minFeeAmount == 0 && amount > 0) {
                minFeeAmount = 1;
            }

            return minFeeAmount > percentageFee ? minFeeAmount : percentageFee;
        } else if (minutesValuation == 0) {
            return percentageFee;
        }

        return percentageFee;
    }

    /**
     * @dev Distribute fee with automatic hybrid conversion
     * @param token Token being transferred
     * @param assetType Type of asset  
     * @param amount Amount to charge fee on
     * @param minutesValuation Minutes valuation
     * @param sender Address paying the fee
     * @param orderId Order ID for tracking
     * @return fee Amount of fee collected
     */
    function distributeFee(
        address token,
        AssetType assetType,
        uint256 amount,
        uint256 minutesValuation,
        address sender,
        bytes32 orderId
    ) external payable returns (uint256) {
        require(sender != address(0), "Invalid sender");

        // Calculate fee
        uint256 fee = calculateFee(token, assetType, amount, minutesValuation);
        bytes32 conversionId = bytes32(0);

        if (fee > 0) {
            // For NFTs or Native tokens, collect in native currency
            if (token ==address(0) || assetType == AssetType.ERC721) {
                require(msg.value >= fee, "Insufficient fee provided in native tokens");
                accumulatedFees[address(0)] += fee;

                // Record fee
                feeHistory.push(
                    FeeRecord({
                        token: token,
                        amount: fee,
                        nativeAmount: fee,
                        conversionId: bytes32(0),
                        timestamp: block.timestamp,
                        orderId: orderId
                    })
                );
            } else {
                // For ERC20: collect token and initiate hybrid conversion
                IERC20(token).safeTransferFrom(sender, address(this), fee);
                
                // Auto-convert if enabled and converter is set
                if (autoConvertFees && 
                    address(hybridConverter) != address(0) && 
                    fee >= minConversionAmount) {
                    
                    // Approve hybrid converter
                    IERC20(token).safeApprove(address(hybridConverter), fee);
                    
                    try hybridConverter.convertToNative(token, fee) returns (bytes32 _conversionId) {
                        conversionId = _conversionId;
                        pendingConversions[conversionId] = true;
                        pendingConversionIds.push(conversionId);

                        emit FeeConversionInitiated(token, fee, conversionId);
                    } catch {
                        // Conversion failed, keep as ERC20
                        accumulatedFees[token] += fee;
                    }
                } else {
                    // No conversion, keep as ERC20
                    accumulatedFees[token] += fee;
                }

                // Record fee
                feeHistory.push(
                    FeeRecord({
                        token: token,
                        amount: fee,
                        nativeAmount: 0,
                        conversionId: conversionId,
                        timestamp: block.timestamp,
                        orderId: orderId
                    })
                );
            }

            emit FeeDistributed(token, fee, orderId, block.timestamp);
        }

        return fee;
    }

    /**
     * @dev Check and claim pending fee conversions
     * Can be called by anyone to process conversions
     * @return totalClaimed Total native currency claimed
     */
    function processPendingConversions() external returns (uint256 totalClaimed) {
        for (uint256 i = 0; i < pendingConversionIds.length; i++) {
            bytes32 conversionId = pendingConversionIds[i];
            
            if (pendingConversions[conversionId]) {
                try hybridConverter.checkConversion(conversionId) returns (bool completed) {
                    if (completed) {
                        // Get conversion details
                        (,,,,, uint256 nativeReceived,) = hybridConverter.conversions(conversionId);
                        
                        if (nativeReceived > 0) {
                            accumulatedFees[address(0)] += nativeReceived;
                            totalClaimed += nativeReceived;
                            pendingConversions[conversionId] = false;

                            emit FeeConversionCompleted(conversionId, nativeReceived);
                        }
                    }
                } catch {
                    // Conversion check failed, skip
                    continue;
                }
            }
        }

        return totalClaimed;
    }

    /**
     * @dev Register Reactive Network contract for debt coverage
     */
    function registerReactiveContract(address reactiveContract) external onlyOwner {
        require(reactiveContract != address(0), "Invalid contract");

        if (!isReactiveContract[reactiveContract]) {
            isReactiveContract[reactiveContract] = true;
            contractsWithDebt.push(reactiveContract);
            emit ReactiveContractRegistered(reactiveContract, true);
        }
    }

    /**
     * @dev Cover debt for Reactive Network contract
     * Uses accumulated native fees only
     */
    function coverReactiveDebt(address reactiveContract) external payable {
        require(reactiveContract != address(0), "Invalid contract");
        require(isReactiveContract[reactiveContract], "Contract not registered");

        uint256 debtAmount = 0;

        // Query debt from system contract
        (bool success, bytes memory data) =
            SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));

        if (success && data.length > 0) {
            debtAmount = abi.decode(data, (uint256));
        }

        require(debtAmount > 0, "No outstanding debt");

        // Use accumulated native fees or msg.value
        uint256 coverAmount = msg.value > 0 ? msg.value : accumulatedFees[address(0)];
        require(coverAmount >= debtAmount, "Insufficient funds to cover debt");

        // Deposit to system contract
        (bool depositSuccess,) =
            SYSTEM_CONTRACT.call{value: coverAmount}(abi.encodeWithSignature("depositTo(address)", reactiveContract));
        require(depositSuccess, "Deposit failed");

        // Update tracking
        if (msg.value == 0) {
            accumulatedFees[address(0)] -= coverAmount;
        }
        debtsCovered[reactiveContract] += coverAmount;

        emit DebtCovered(reactiveContract, coverAmount, block.timestamp);
    }

    /**
     * @dev Set hybrid converter address
     */
    function setHybridConverter(address _hybridConverter) external onlyOwner {
        require(_hybridConverter != address(0), "Invalid converter");
        hybridConverter = HybridFeeConverter(_hybridConverter);
        emit HybridConverterUpdated(_hybridConverter);
    }

    /**
     * @dev Set auto-convert fees flag
     */
    function setAutoConvertFees(bool enabled) external onlyOwner {
        autoConvertFees = enabled;
        emit AutoConvertFeesUpdated(enabled);
    }

    /**
     * @dev Set Trust Wallet address for token
     */
    function setTrustWalletAddress(address token, address wallet) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(wallet != address(0), "Invalid wallet");
        trustWalletAddresses[token] = wallet;
        emit TrustWalletAddressSet(token, wallet);
    }

    /**
     * @dev Set default Trust Wallet
     */
    function setDefaultTrustWallet(address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");
        defaultTrustWallet = wallet;
        emit DefaultTrustWalletSet(wallet);
    }

    /**
     * @dev Get accumulated fees (native only after conversion)
     */
    function getAccumulatedFees(address token) external view returns (uint256) {
        return accumulatedFees[token];
    }

    /**
     * @dev Get pending conversion count
     */
    function getPendingConversionCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < pendingConversionIds.length; i++) {
            if (pendingConversions[pendingConversionIds[i]]) {
                count++;
            }
        }
        return count;
    }

    /**
     * @dev Withdraw fees to Trust Wallet
     */
    function withdrawFees(address token) external onlyOwner {
        uint256 amount = accumulatedFees[token];
        require(amount > 0, "No fees to withdraw");

        accumulatedFees[token] = 0;

        address trustWallet = trustWalletAddresses[token];
        if (trustWallet == address(0)) {
            trustWallet = defaultTrustWallet;
        }

        if (token == address(0)) {
            (bool success,) = trustWallet.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(trustWallet, amount);
        }
    }

    /**
     * @dev Receive function to accept native tokens
     */
    receive() external payable {}
}
