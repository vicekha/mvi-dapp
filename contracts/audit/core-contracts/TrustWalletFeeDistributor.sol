// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TrustWalletFeeDistributor
 * @dev Direct fee distribution to Trust Wallet addresses with Reactive Network debt coverage
 * Reactive Network Compliant - Emits events for fee tracking and automatic debt settlement
 */
contract TrustWalletFeeDistributor is Ownable {
    // Asset type enum
    enum AssetType {
        ERC20,
        ERC721
    }

    // Reactive Network System Contract
    address public constant SYSTEM_CONTRACT = address(uint160(0xFFFFFF));
    using SafeERC20 for IERC20;

    // Mapping of token address to Trust Wallet address for current chain
    mapping(address => address) public trustWalletAddresses;

    // Default Trust Wallet address for this chain
    address public defaultTrustWallet;

    // Fee parameters
    uint256 public constant FEE_RATE = 100; // 1% (in basis points)
    uint256 public constant MIN_FEE_MINUTES = 0; // No minimum fee - allows testing with zero fees

    // Fee tracking for Reactive Network
    struct FeeRecord {
        address token;
        address recipient;
        uint256 amount;
        uint256 timestamp;
        bytes32 orderId;
    }

    FeeRecord[] public feeHistory;

    // Debt coverage tracking
    mapping(address => uint256) public accumulatedFees; // Accumulated fees per token
    mapping(address => uint256) public debtsCovered; // Total debts covered per contract
    address[] public contractsWithDebt; // Contracts that had debt covered

    // Configuration
    uint256 public debtCoverageThreshold = 0.01 ether; // Minimum fee accumulation before covering debt
    mapping(address => bool) public isReactiveContract; // Track which contracts are on Reactive Network

    // Events - Reactive Network compliant
    event TrustWalletAddressSet(address indexed token, address wallet);
    event DefaultTrustWalletSet(address wallet);
    event FeeDistributed(
        address indexed token, address indexed recipient, uint256 amount, bytes32 indexed orderId, uint256 timestamp
    );
    event FeeDistributorInitialized(address indexed owner, address defaultWallet);
    event DebtCovered(address indexed reactiveContract, uint256 amount, uint256 timestamp);
    event DebtCoverageThresholdUpdated(uint256 newThreshold);
    event ReactiveContractRegistered(address indexed contractAddr, bool isReactive);

    constructor(address _defaultTrustWallet) {
        require(_defaultTrustWallet != address(0), "Invalid default wallet");
        defaultTrustWallet = _defaultTrustWallet;
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
            // Conver minutes to native units (assuming 1:1 for simplicity or as base unit)
            // In a real system, this would use an oracle.
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
     * @dev Distribute fee directly to Trust Wallet and accumulate for debt coverage
     * @param token Token being transferred
     * @param amount Amount to charge fee on
     * @param minutesValuation Minutes valuation of the transfer
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
    ) external payable virtual returns (uint256) {
        require(sender != address(0), "Invalid sender");

        // Calculate fee
        uint256 fee = calculateFee(token, assetType, amount, minutesValuation);

        if (fee > 0) {
            address trustWallet = trustWalletAddresses[token] != address(0) ? trustWalletAddresses[token] : defaultTrustWallet;
            require(trustWallet != address(0), "Trust Wallet not set");

            // For NFTs or Native, we take the fee in Native (msg.value)
            if (token == address(0) || assetType == AssetType.ERC721) {
                require(msg.value >= fee, "Insufficient fee provided in native tokens");
                
                uint256 amountToDistribute = fee;

                // Check for debt on System Contract
                uint256 debt = 0;
                // Use staticcall to avoid potential reverts from system contract interface mismatch
                (bool success, bytes memory data) = SYSTEM_CONTRACT.staticcall(
                    abi.encodeWithSignature("debts(address)", msg.sender)
                );
                if (success && data.length > 0) {
                    debt = abi.decode(data, (uint256));
                }

                // If debt exists, pay it first
                if (debt > 0) {
                    uint256 payAmount = amountToDistribute > debt ? debt : amountToDistribute;
                    
                    (bool depositSuccess,) = SYSTEM_CONTRACT.call{value: payAmount}(
                        abi.encodeWithSignature("depositTo(address)", msg.sender)
                    );

                    if (depositSuccess) {
                        amountToDistribute -= payAmount;
                        debtsCovered[msg.sender] += payAmount;
                        emit DebtCovered(msg.sender, payAmount, block.timestamp);
                    }
                }

                // Forward remaining to Trust Wallet
                if (amountToDistribute > 0) {
                    (bool transferSuccess, ) = trustWallet.call{value: amountToDistribute}("");
                    require(transferSuccess, "Transfer to Trust Wallet failed");
                }

            } else {
                // For ERC20, we forward it directly to the Trust Wallet
                IERC20(token).safeTransferFrom(sender, trustWallet, fee);
            }

            // Record fee for tracking
            feeHistory.push(
                FeeRecord({
                    token: token, recipient: trustWallet, amount: fee, timestamp: block.timestamp, orderId: orderId
                })
            );

            emit FeeDistributed(token, trustWallet, fee, orderId, block.timestamp);
        }

        return fee;
    }

    /**
     * @dev Check if token is native (ETH/MATIC)
     * @param token Token address
     * @return True if native token
     */
    function isNativeToken(address token) public pure returns (bool) {
        // address(0) represents native token in this context
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
     * @param reactiveContract Address of the Reactive Network contract
     * @param token Token to use for debt coverage
     */
    function coverReactiveDebt(address reactiveContract, address token) external payable {
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

        // Use accumulated fees or msg.value
        uint256 coverAmount = msg.value > 0 ? msg.value : accumulatedFees[token];
        require(coverAmount >= debtAmount, "Insufficient funds to cover debt");

        // Deposit to system contract to cover debt
        (bool depositSuccess,) =
            SYSTEM_CONTRACT.call{value: coverAmount}(abi.encodeWithSignature("depositTo(address)", reactiveContract));
        require(depositSuccess, "Deposit failed");

        // Update tracking
        if (msg.value == 0) {
            accumulatedFees[token] -= coverAmount;
        }
        debtsCovered[reactiveContract] += coverAmount;

        emit DebtCovered(reactiveContract, coverAmount, block.timestamp);
    }

    /**
     * @dev Automatically cover debt if threshold reached
     * @param reactiveContract Address of the Reactive Network contract
     * @param token Token to use for debt coverage
     */
    function autoCheckAndCoverDebt(address reactiveContract, address token) external {
        require(reactiveContract != address(0), "Invalid contract");
        require(isReactiveContract[reactiveContract], "Contract not registered");

        // Check if accumulated fees exceed threshold
        if (accumulatedFees[token] >= debtCoverageThreshold) {
            // Query debt
            (bool success, bytes memory data) =
                SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));

            if (success && data.length > 0) {
                uint256 debtAmount = abi.decode(data, (uint256));

                if (debtAmount > 0 && accumulatedFees[token] >= debtAmount) {
                    // Cover the debt
                    (bool depositSuccess,) = SYSTEM_CONTRACT.call{value: debtAmount}(
                        abi.encodeWithSignature("depositTo(address)", reactiveContract)
                    );

                    if (depositSuccess) {
                        accumulatedFees[token] -= debtAmount;
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
     * @param token Token address
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
     * @dev Receive function to accept ETH for debt coverage
     */
    receive() external payable virtual {}
}
