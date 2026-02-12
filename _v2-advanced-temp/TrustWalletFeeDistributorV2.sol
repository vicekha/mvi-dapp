// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IFeeSwapper {
    function swapToNativeFor(
        address token,
        uint256 amount,
        address recipient,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);
    
    function calculateMinAmountOut(address token, uint256 amountIn) external view returns (uint256);
}

/**
 * @title TrustWalletFeeDistributorV2
 * @dev Enhanced fee distributor with automatic ERC20→Native conversion
 * Integrates with FeeSwapper for better UX (users pay fees in swap token)
 * All fees converted to native currency for Reactive Network debt coverage
 */
contract TrustWalletFeeDistributorV2 is Ownable {
    using SafeERC20 for IERC20;

    // Asset type enum
    enum AssetType {
        ERC20,
        ERC721
    }

    // Reactive Network System Contract
    address public constant SYSTEM_CONTRACT = 0x0000000000000000000000000000000000fffFfF;

    // Components
    IFeeSwapper public feeSwapper;

    // Mapping of token address to Trust Wallet address for current chain
    mapping(address => address) public trustWalletAddresses;

    // Default Trust Wallet address for this chain
    address public defaultTrustWallet;

    // Fee parameters
    uint256 public constant FEE_RATE = 100; // 1% (in basis points)
    uint256 public constant MIN_FEE_MINUTES = 1 * 10 ** 18; // 1 minute (18 decimals)

    // Fee tracking for Reactive Network
    struct FeeRecord {
        address token;
        address recipient;
        uint256 amount;
        uint256 nativeAmount; // Amount after conversion (if applicable)
        uint256 timestamp;
        bytes32 orderId;
    }

    FeeRecord[] public feeHistory;

    // Debt coverage tracking
    mapping(address => uint256) public accumulatedFees; // Accumulated fees (native only after V2)
    mapping(address => uint256) public debtsCovered; // Total debts covered per contract
    address[] public contractsWithDebt; // Contracts that had debt covered

    // Configuration
    uint256 public debtCoverageThreshold = 0.01 ether; // Minimum fee accumulation before covering debt
    mapping(address => bool) public isReactiveContract; // Track which contracts are on Reactive Network
    
    // Conversion settings
    bool public autoConvertFees = true; // Automatically convert ERC20 fees to native
    uint256 public minConversionAmount = 0.001 ether; // Minimum amount to convert (avoid dust)

    // Events - Reactive Network compliant
    event TrustWalletAddressSet(address indexed token, address wallet);
    event DefaultTrustWalletSet(address wallet);
    event FeeDistributed(
        address indexed token, address indexed recipient, uint256 amount, bytes32 indexed orderId, uint256 timestamp
    );
    event FeeConverted(
        address indexed token, uint256 amountIn, uint256 nativeAmountOut, uint256 timestamp
    );
    event FeeDistributorInitialized(address indexed owner, address defaultWallet);
    event DebtCovered(address indexed reactiveContract, uint256 amount, uint256 timestamp);
    event DebtCoverageThresholdUpdated(uint256 newThreshold);
    event ReactiveContractRegistered(address indexed contractAddr, bool isReactive);
    event FeeSwapperUpdated(address indexed newSwapper);
    event AutoConvertFeesUpdated(bool enabled);

    constructor(address _defaultTrustWallet, address _feeSwapper) {
        require(_defaultTrustWallet != address(0), "Invalid default wallet");
        
        defaultTrustWallet = _defaultTrustWallet;
        if (_feeSwapper != address(0)) {
            feeSwapper = IFeeSwapper(_feeSwapper);
        }
        
        emit FeeDistributorInitialized(msg.sender, _defaultTrustWallet);
        emit DefaultTrustWalletSet(_defaultTrustWallet);
    }

    /**
     * @dev Set Trust Wallet address for a specific token
     * @param token Token address
     * @param wallet Trust Wallet address
     */
    function setTrustWalletAddress(address token, address wallet) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(wallet != address(0), "Invalid wallet");

        trustWalletAddresses[token] = wallet;
        emit TrustWalletAddressSet(token, wallet);
    }

    /**
     * @dev Set default Trust Wallet address for this chain
     * @param wallet Default Trust Wallet address
     */
    function setDefaultTrustWallet(address wallet) external onlyOwner {
        require(wallet != address(0), "Invalid wallet");

        defaultTrustWallet = wallet;
        emit DefaultTrustWalletSet(wallet);
    }

    /**
     * @dev Set FeeSwapper contract
     * @param _feeSwapper FeeSwapper address
     */
    function setFeeSwapper(address _feeSwapper) external onlyOwner {
        require(_feeSwapper != address(0), "Invalid fee swapper");
        feeSwapper = IFeeSwapper(_feeSwapper);
        emit FeeSwapperUpdated(_feeSwapper);
    }

    /**
     * @dev Enable/disable automatic fee conversion
     * @param enabled Whether to auto-convert
     */
    function setAutoConvertFees(bool enabled) external onlyOwner {
        autoConvertFees = enabled;
        emit AutoConvertFeesUpdated(enabled);
    }

    /**
     * @dev Bulk set Trust Wallet addresses
     * @param tokens Array of token addresses
     * @param wallets Array of Trust Wallet addresses
     */
    function bulkSetTrustWalletAddresses(address[] calldata tokens, address[] calldata wallets) external onlyOwner {
        require(tokens.length == wallets.length, "Array length mismatch");

        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Invalid token");
            require(wallets[i] != address(0), "Invalid wallet");

            trustWalletAddresses[tokens[i]] = wallets[i];
            emit TrustWalletAddressSet(tokens[i], wallets[i]);
        }
    }

    /**
     * @dev Calculate fee based on minutes-based valuation
     * @param amount Token amount
     * @param minutesValuation Minutes valuation
     * @return fee Fee amount in token units
     */
    function calculateFee(
        address,
        /* token */
        AssetType assetType,
        uint256 amount,
        uint256 minutesValuation
    )
        public
        pure
        returns (uint256)
    {
        // For NFTs, the fee is always based on minutes valuation
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
            // Need to convert minimum minutes fee to token amount
            uint256 minFeeRatio = (MIN_FEE_MINUTES * 10 ** 18) / minutesValuation;
            uint256 minFeeAmount = (amount * minFeeRatio) / 10 ** 18;

            // Handle non-fractional tokens
            if (minFeeAmount == 0 && amount > 0) {
                minFeeAmount = 1; // Minimum of 1 token unit
            }

            return minFeeAmount > percentageFee ? minFeeAmount : percentageFee;
        } else if (minutesValuation == 0) {
            // If valuation is zero, return the percentage-based fee or 0
            return percentageFee;
        }

        return percentageFee;
    }

    /**
     * @dev Distribute fee with automatic conversion to native
     * @param token Token being transferred
     * @param amount Amount to charge fee on
     * @param minutesValuation Minutes valuation of the transfer
     * @param sender Address paying the fee
     * @param orderId Order ID for tracking
     * @return fee Amount of fee collected (in token units)
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
        uint256 nativeAmount = 0;

        if (fee > 0) {
            // For NFTs or Native tokens, collect in native currency
            if (token == address(0) || assetType == AssetType.ERC721) {
                require(msg.value >= fee, "Insufficient fee provided in native tokens");
                nativeAmount = fee;
                accumulatedFees[address(0)] += fee;
            } else {
                // For ERC20: collect token and convert to native
                IERC20(token).safeTransferFrom(sender, address(this), fee);
                
                // Auto-convert if enabled and swapper is set
                if (autoConvertFees && address(feeSwapper) != address(0) && fee >= minConversionAmount) {
                    try this._convertFeeToNative(token, fee) returns (uint256 converted) {
                        nativeAmount = converted;
                        accumulatedFees[address(0)] += converted;
                        emit FeeConverted(token, fee, converted, block.timestamp);
                    } catch {
                        // Conversion failed, keep as ERC20
                        accumulatedFees[token] += fee;
                        nativeAmount = 0;
                    }
                } else {
                    // No conversion, keep as ERC20
                    accumulatedFees[token] += fee;
                }
            }

            // Record fee for tracking
            feeHistory.push(
                FeeRecord({
                    token: token,
                    recipient: address(this),
                    amount: fee,
                    nativeAmount: nativeAmount,
                    timestamp: block.timestamp,
                    orderId: orderId
                })
            );

            emit FeeDistributed(token, address(this), fee, orderId, block.timestamp);
        }

        return fee;
    }

    /**
     * @dev Internal function to convert fee to native (external for try-catch)
     * @param token Token to convert
     * @param amount Amount to convert
     * @return nativeAmount Amount of native received
     */
    function _convertFeeToNative(address token, uint256 amount) external returns (uint256) {
        require(msg.sender == address(this), "Only self");
        
        // Calculate minimum amount out with slippage protection
        uint256 minAmountOut = feeSwapper.calculateMinAmountOut(token, amount);
        
        // Approve swapper
        IERC20(token).safeApprove(address(feeSwapper), amount);
        
        // Swap
        uint256 nativeAmount = feeSwapper.swapToNativeFor(
            token,
            amount,
            address(this),
            minAmountOut
        );
        
        return nativeAmount;
    }

    /**
     * @dev Check if token is native (ETH/MATIC)
     * @param token Token address
     * @return True if native token
     */
    function isNativeToken(address token) public pure returns (bool) {
        return token == address(0);
    }

    /**
     * @dev Register a Reactive Network contract for debt coverage
     * @param reactiveContract Address of the Reactive Network contract
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
     * @dev Unregister a Reactive Network contract
     * @param reactiveContract Address of the Reactive Network contract
     */
    function unregisterReactiveContract(address reactiveContract) external onlyOwner {
        require(reactiveContract != address(0), "Invalid contract");
        isReactiveContract[reactiveContract] = false;
        emit ReactiveContractRegistered(reactiveContract, false);
    }

    /**
     * @dev Cover debt for a Reactive Network contract using accumulated fees
     * Only uses native currency (address(0))
     * @param reactiveContract Address of the Reactive Network contract
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

        // Deposit to system contract to cover debt
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
     * @dev Automatically cover debt if threshold reached
     * @param reactiveContract Address of the Reactive Network contract
     */
    function autoCheckAndCoverDebt(address reactiveContract) external {
        require(reactiveContract != address(0), "Invalid contract");
        require(isReactiveContract[reactiveContract], "Contract not registered");

        // Check if accumulated native fees exceed threshold
        if (accumulatedFees[address(0)] >= debtCoverageThreshold) {
            // Query debt
            (bool success, bytes memory data) =
                SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));

            if (success && data.length > 0) {
                uint256 debtAmount = abi.decode(data, (uint256));

                if (debtAmount > 0 && accumulatedFees[address(0)] >= debtAmount) {
                    // Cover the debt
                    (bool depositSuccess,) = SYSTEM_CONTRACT.call{value: debtAmount}(
                        abi.encodeWithSignature("depositTo(address)", reactiveContract)
                    );

                    if (depositSuccess) {
                        accumulatedFees[address(0)] -= debtAmount;
                        debtsCovered[reactiveContract] += debtAmount;
                        emit DebtCovered(reactiveContract, debtAmount, block.timestamp);
                    }
                }
            }
        }
    }

    /**
     * @dev Set debt coverage threshold
     * @param newThreshold New threshold amount
     */
    function setDebtCoverageThreshold(uint256 newThreshold) external onlyOwner {
        debtCoverageThreshold = newThreshold;
        emit DebtCoverageThresholdUpdated(newThreshold);
    }

    /**
     * @dev Get accumulated fees for a token
     * @param token Token address (address(0) for native)
     * @return Accumulated fee amount
     */
    function getAccumulatedFees(address token) external view returns (uint256) {
        return accumulatedFees[token];
    }

    /**
     * @dev Get total debts covered for a contract
     * @param reactiveContract Contract address
     * @return Total debts covered
     */
    function getTotalDebtsCovered(address reactiveContract) external view returns (uint256) {
        return debtsCovered[reactiveContract];
    }

    /**
     * @dev Get number of contracts with debt
     * @return Number of contracts
     */
    function getContractsWithDebtCount() external view returns (uint256) {
        return contractsWithDebt.length;
    }

    /**
     * @dev Get contract address by index
     * @param index Index in contractsWithDebt array
     * @return Contract address
     */
    function getContractWithDebt(uint256 index) external view returns (address) {
        require(index < contractsWithDebt.length, "Index out of bounds");
        return contractsWithDebt[index];
    }

    /**
     * @dev Get Trust Wallet address for a token
     * @param token Token address
     * @return Trust Wallet address
     */
    function getTrustWalletForToken(address token) external view returns (address) {
        address trustWallet = trustWalletAddresses[token];
        return trustWallet != address(0) ? trustWallet : defaultTrustWallet;
    }

    /**
     * @dev Get fee history length
     * @return Number of fee records
     */
    function getFeeHistoryLength() external view returns (uint256) {
        return feeHistory.length;
    }

    /**
     * @dev Get fee record by index
     * @param index Index in fee history
     * @return Fee record
     */
    function getFeeRecord(uint256 index) external view returns (FeeRecord memory) {
        require(index < feeHistory.length, "Index out of bounds");
        return feeHistory[index];
    }

    /**
     * @dev Withdraw fees to Trust Wallet
     * @param token Token address to withdraw (address(0) for native)
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
     * @dev Manually convert accumulated ERC20 fees to native
     * @param token Token to convert
     */
    function manualConvertFees(address token) external onlyOwner {
        require(token != address(0), "Cannot convert native token");
        require(address(feeSwapper) != address(0), "FeeSwapper not set");
        
        uint256 amount = accumulatedFees[token];
        require(amount > 0, "No fees to convert");
        require(amount >= minConversionAmount, "Amount below minimum");
        
        // Calculate minimum amount out
        uint256 minAmountOut = feeSwapper.calculateMinAmountOut(token, amount);
        
        // Approve and swap
        IERC20(token).safeApprove(address(feeSwapper), amount);
        uint256 nativeAmount = feeSwapper.swapToNativeFor(
            token,
            amount,
            address(this),
            minAmountOut
        );
        
        // Update balances
        accumulatedFees[token] -= amount;
        accumulatedFees[address(0)] += nativeAmount;
        
        emit FeeConverted(token, amount, nativeAmount, block.timestamp);
    }

    /**
     * @dev Receive function to accept ETH for debt coverage
     */
    receive() external payable {}
}
