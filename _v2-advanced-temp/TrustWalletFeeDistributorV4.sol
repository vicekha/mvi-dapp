// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HybridFeeConverter} from "./HybridFeeConverter.sol";

/**
 * @title TrustWalletFeeDistributorV4
 * @dev Auto-distributing fee collector with debt coverage priority
 * 
 * Fee Distribution Flow:
 * 1. Collect fees (with auto-conversion to native)
 * 2. Check Reactive Network debt
 * 3. Cover debt if outstanding
 * 4. Send remaining fees to Trust Wallet
 * 
 * This ensures system stays operational while maximizing fee payouts
 */
contract TrustWalletFeeDistributorV4 is Ownable {
    using SafeERC20 for IERC20;

    // Asset type enum
    enum AssetType {
        ERC20,
        ERC721
    }

    // Reactive Network System Contract
    address public constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000fffFfF;

    // Components
    HybridFeeConverter public hybridConverter;

    // Trust Wallet configuration
    mapping(address => address) public trustWalletAddresses;
    address public defaultTrustWallet;

    // Fee parameters
    uint256 public constant FEE_RATE = 100; // 1% (in basis points)
    uint256 public constant MIN_FEE_MINUTES = 1 * 10 ** 18; // 1 minute (18 decimals)

    // Auto-distribution settings
    bool public autoDistributeEnabled = true;
    uint256 public minDistributionAmount = 0.001 ether; // Minimum to distribute
    uint256 public debtReserveRatio = 2000; // 20% reserve for debt (in basis points)

    // Tracking
    mapping(address => uint256) public totalFeesCollected;
    mapping(address => uint256) public totalFeesDistributed;
    mapping(address => uint256) public totalDebtsCovered;
    address[] public reactiveContracts;
    mapping(address => bool) public isReactiveContract;

    // Pending conversions
    mapping(bytes32 => bool) public pendingConversions;
    bytes32[] public pendingConversionIds;

    // Temporary accumulation (for debt reserve)
    mapping(address => uint256) public pendingFees;

    // Events
    event FeeCollected(
        address indexed token,
        uint256 amount,
        bytes32 indexed orderId,
        uint256 timestamp
    );
    event FeeDistributed(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );
    event DebtCovered(
        address indexed reactiveContract,
        uint256 amount,
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
    event AutoDistributeToggled(bool enabled);
    event TrustWalletAddressSet(address indexed token, address wallet);
    event DefaultTrustWalletSet(address wallet);

    constructor(
        address _defaultTrustWallet,
        address _hybridConverter
    ) {
        require(_defaultTrustWallet != address(0), "Invalid default wallet");
        
        defaultTrustWallet = _defaultTrustWallet;
        
        if (_hybridConverter != address(0)) {
            hybridConverter = HybridFeeConverter(_hybridConverter);
        }
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
        if (assetType == AssetType.ERC721) {
            uint256 nftFeeInMinutes = (minutesValuation * FEE_RATE) / 10000;
            if (nftFeeInMinutes < MIN_FEE_MINUTES) {
                nftFeeInMinutes = MIN_FEE_MINUTES;
            }
            return nftFeeInMinutes;
        }

        uint256 percentageFee = (amount * FEE_RATE) / 10000;
        uint256 feeInMinutes = (minutesValuation * FEE_RATE) / 10000;

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
     * @dev Distribute fee with auto-distribution after debt coverage
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

        uint256 fee = calculateFee(token, assetType, amount, minutesValuation);
        bytes32 conversionId = bytes32(0);

        if (fee > 0) {
            // For NFTs or Native, collect in native
            if (token == address(0) || assetType == AssetType.ERC721) {
                require(msg.value >= fee, "Insufficient fee");
                pendingFees[address(0)] += fee;
                totalFeesCollected[address(0)] += fee;
                
                emit FeeCollected(token, fee, orderId, block.timestamp);
                
                // Try auto-distribute
                _autoDistribute(address(0));
                
            } else {
                // For ERC20: collect and convert
                IERC20(token).safeTransferFrom(sender, address(this), fee);
                totalFeesCollected[token] += fee;
                
                // Initiate conversion
                if (address(hybridConverter) != address(0)) {
                    IERC20(token).safeApprove(address(hybridConverter), fee);
                    
                    try hybridConverter.convertToNative(token, fee) returns (bytes32 _conversionId) {
                        conversionId = _conversionId;
                        pendingConversions[conversionId] = true;
                        pendingConversionIds.push(conversionId);
                        
                        emit FeeConversionInitiated(token, fee, conversionId);
                    } catch {
                        // Conversion failed, keep as ERC20
                        pendingFees[token] += fee;
                    }
                } else {
                    pendingFees[token] += fee;
                }
                
                emit FeeCollected(token, fee, orderId, block.timestamp);
            }
        }

        return fee;
    }

    /**
     * @dev Process pending conversions and auto-distribute
     * Can be called by anyone
     */
    function processPendingConversions() external {
        for (uint256 i = 0; i < pendingConversionIds.length; i++) {
            bytes32 conversionId = pendingConversionIds[i];
            
            if (pendingConversions[conversionId]) {
                try hybridConverter.checkConversion(conversionId) returns (bool completed) {
                    if (completed) {
                        (,,,,, uint256 nativeReceived,) = hybridConverter.conversions(conversionId);
                        
                        if (nativeReceived > 0) {
                            pendingFees[address(0)] += nativeReceived;
                            pendingConversions[conversionId] = false;
                            
                            emit FeeConversionCompleted(conversionId, nativeReceived);
                            
                            // Try auto-distribute
                            _autoDistribute(address(0));
                        }
                    }
                } catch {
                    continue;
                }
            }
        }
    }

    /**
     * @dev Auto-distribute fees: cover debt first, then send to wallet
     * @param token Token to distribute (address(0) for native)
     */
    function _autoDistribute(address token) internal {
        if (!autoDistributeEnabled) return;
        
        uint256 available = pendingFees[token];
        if (available < minDistributionAmount) return;

        // For native currency, check and cover debt
        if (token == address(0)) {
            // Reserve portion for potential debt
            uint256 reserve = (available * debtReserveRatio) / 10000;
            uint256 distributable = available - reserve;
            
            // Try to cover any outstanding debt with reserve
            uint256 totalDebt = _getTotalOutstandingDebt();
            
            if (totalDebt > 0) {
                uint256 debtToCover = totalDebt < reserve ? totalDebt : reserve;
                _coverAllDebts(debtToCover);
                
                // Update distributable amount
                distributable = available - debtToCover;
            }
            
            // Distribute remaining to Trust Wallet
            if (distributable >= minDistributionAmount) {
                address trustWallet = _getTrustWallet(token);
                
                pendingFees[token] -= distributable;
                totalFeesDistributed[token] += distributable;
                
                (bool success,) = trustWallet.call{value: distributable}("");
                if (success) {
                    emit FeeDistributed(token, trustWallet, distributable, block.timestamp);
                } else {
                    // Revert if distribution fails
                    pendingFees[token] += distributable;
                    totalFeesDistributed[token] -= distributable;
                }
            }
        } else {
            // ERC20 tokens: send directly (no debt coverage needed)
            address trustWallet = _getTrustWallet(token);
            
            pendingFees[token] = 0;
            totalFeesDistributed[token] += available;
            
            IERC20(token).safeTransfer(trustWallet, available);
            emit FeeDistributed(token, trustWallet, available, block.timestamp);
        }
    }

    /**
     * @dev Get total outstanding debt for all reactive contracts
     */
    function _getTotalOutstandingDebt() internal view returns (uint256 total) {
        for (uint256 i = 0; i < reactiveContracts.length; i++) {
            address reactiveContract = reactiveContracts[i];
            
            (bool success, bytes memory data) =
                SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));
            
            if (success && data.length > 0) {
                uint256 debt = abi.decode(data, (uint256));
                total += debt;
            }
        }
        
        return total;
    }

    /**
     * @dev Cover debts for all reactive contracts
     */
    function _coverAllDebts(uint256 maxAmount) internal {
        uint256 remaining = maxAmount;
        
        for (uint256 i = 0; i < reactiveContracts.length && remaining > 0; i++) {
            address reactiveContract = reactiveContracts[i];
            
            (bool success, bytes memory data) =
                SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));
            
            if (success && data.length > 0) {
                uint256 debt = abi.decode(data, (uint256));
                
                if (debt > 0) {
                    uint256 toCover = debt < remaining ? debt : remaining;
                    
                    (bool depositSuccess,) = SYSTEM_CONTRACT.call{value: toCover}(
                        abi.encodeWithSignature("depositTo(address)", reactiveContract)
                    );
                    
                    if (depositSuccess) {
                        totalDebtsCovered[reactiveContract] += toCover;
                        remaining -= toCover;
                        
                        emit DebtCovered(reactiveContract, toCover, block.timestamp);
                    }
                }
            }
        }
        
        // Update pending fees
        pendingFees[address(0)] -= (maxAmount - remaining);
    }

    /**
     * @dev Get Trust Wallet address for token
     */
    function _getTrustWallet(address token) internal view returns (address) {
        address trustWallet = trustWalletAddresses[token];
        return trustWallet != address(0) ? trustWallet : defaultTrustWallet;
    }

    /**
     * @dev Manually trigger distribution for a token
     */
    function manualDistribute(address token) external onlyOwner {
        _autoDistribute(token);
    }

    /**
     * @dev Register Reactive Network contract
     */
    function registerReactiveContract(address reactiveContract) external onlyOwner {
        require(reactiveContract != address(0), "Invalid contract");
        
        if (!isReactiveContract[reactiveContract]) {
            isReactiveContract[reactiveContract] = true;
            reactiveContracts.push(reactiveContract);
        }
    }

    /**
     * @dev Set auto-distribute enabled
     */
    function setAutoDistributeEnabled(bool enabled) external onlyOwner {
        autoDistributeEnabled = enabled;
        emit AutoDistributeToggled(enabled);
    }

    /**
     * @dev Set minimum distribution amount
     */
    function setMinDistributionAmount(uint256 amount) external onlyOwner {
        minDistributionAmount = amount;
    }

    /**
     * @dev Set debt reserve ratio (basis points)
     */
    function setDebtReserveRatio(uint256 ratio) external onlyOwner {
        require(ratio <= 5000, "Ratio too high"); // Max 50%
        debtReserveRatio = ratio;
    }

    /**
     * @dev Set Trust Wallet address
     */
    function setTrustWalletAddress(address token, address wallet) external onlyOwner {
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
     * @dev Set hybrid converter
     */
    function setHybridConverter(address _hybridConverter) external onlyOwner {
        require(_hybridConverter != address(0), "Invalid converter");
        hybridConverter = HybridFeeConverter(_hybridConverter);
    }

    /**
     * @dev Get pending fees for token
     */
    function getPendingFees(address token) external view returns (uint256) {
        return pendingFees[token];
    }

    /**
     * @dev Get statistics
     */
    function getStatistics(address token) external view returns (
        uint256 collected,
        uint256 distributed,
        uint256 pending
    ) {
        return (
            totalFeesCollected[token],
            totalFeesDistributed[token],
            pendingFees[token]
        );
    }

    /**
     * @dev Emergency withdraw (owner only)
     */
    function emergencyWithdraw(address token, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        
        if (token == address(0)) {
            uint256 balance = address(this).balance;
            (bool success,) = to.call{value: balance}("");
            require(success, "Transfer failed");
        } else {
            uint256 balance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransfer(to, balance);
        }
    }

    /**
     * @dev Receive function
     */
    receive() external payable {}
}
