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

interface IWETH9 {
    function withdraw(uint wad) external;
    function deposit() external payable;
    function balanceOf(address account) external view returns (uint256);
}

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
    uint256 public feeRate = 5; // 0.05% (in basis points) - configurable
    uint256 public minFeeMinutes = 10; // L-4: Non-zero minimum fee in minutes units
    uint256 public minNftFeeWei = 0.0005 ether; // H-4: Minimum flat fee for NFT orders in wei

    // Events for fee rate changes
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);

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
    // If true, native fees are forwarded instantly to Trust Wallet (for Origin chains)
    // If false, native fees accumulate to auto-cover cross-chain debts (for Lasna/Reactive Network)
    bool public autoRouteNativeToken = false; 
    uint256 public debtCoverageThreshold = 0.01 ether; // Minimum fee accumulation before covering debt
    mapping(address => bool) public isReactiveContract; // Track which contracts are on Reactive Network

    // Automated AMM Swap Mechanics (Concentrated Liquidity)
    ISwapRouter public dexRouter;
    address public wethAddress; // WREACT or WETH for wrapping/unwrapping
    uint24 public poolFeeTier = 3000; // default 0.3% fee tier pool
    uint256 public feeConversionRate = 10000; // 100% default conversion of ERC20 to REACT (in basis points)
    uint256 public automatedSlippageTolerance = 50; // 0.5% default slippage tolerance (basis points)

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
    event AccumulatedFeesWithdrawn(address indexed owner, address indexed recipient, uint256 amount);

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
     * @dev Set fee rate (in basis points, 100 = 1%)
     * @param newRate New fee rate in basis points
     */
    function setFeeRate(uint256 newRate) external onlyOwner {
        require(newRate <= 1000, "Fee rate too high"); // Max 10%
        uint256 oldRate = feeRate;
        feeRate = newRate;
        emit FeeRateUpdated(oldRate, newRate);
    }

    /**
     * @dev Set whether native tokens bypass debt accumulation and stream directly to Trust Wallet
     */
    function setAutoRouteNativeToken(bool _autoRoute) external onlyOwner {
        autoRouteNativeToken = _autoRoute;
    }

    /**
     * @dev Set minimum fee parameters
     */
    function setMinFeeMinutes(uint256 _minFeeMinutes) external onlyOwner {
        minFeeMinutes = _minFeeMinutes;
    }

    function setMinNftFeeWei(uint256 _minNftFeeWei) external onlyOwner {
        minNftFeeWei = _minNftFeeWei;
    }

    /**
     * @dev AMM Router setup (V3 Concentrated Liquidity)
     */
    function setDexRouter(address router) external onlyOwner {
        dexRouter = ISwapRouter(router);
    }
    
    function setWethAddress(address _weth) external onlyOwner {
        wethAddress = _weth;
    }

    function setPoolFeeTier(uint24 _feeTier) external onlyOwner {
        poolFeeTier = _feeTier;
    }

    function setFeeConversionRate(uint256 rate) external onlyOwner {
        require(rate <= 10000, "Rate exceeds 100%");
        feeConversionRate = rate;
    }

    function setAutomatedSlippageTolerance(uint256 slippage) external onlyOwner {
        require(slippage <= 10000, "Slippage exceeds 100%");
        automatedSlippageTolerance = slippage;
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
        view
        returns (uint256)
    {
        // H-4: For NFTs, the fee is based on minutes valuation with a minimum flat fee
        if (assetType == AssetType.ERC721) {
            uint256 nftFeeInMinutes = (minutesValuation * feeRate) / 10000;
            if (nftFeeInMinutes < minFeeMinutes) {
                nftFeeInMinutes = minFeeMinutes;
            }
            // Enforce minimum flat fee in wei for NFT orders
            if (nftFeeInMinutes < minNftFeeWei) {
                return minNftFeeWei;
            }
            return nftFeeInMinutes;
        }

        // Calculate percentage-based fee for ERC20
        uint256 percentageFee = (amount * feeRate) / 10000;

        // Calculate fee in minutes
        uint256 feeInMinutes = (minutesValuation * feeRate) / 10000;

        // Ensure minimum fee in minutes
        if (minutesValuation > 0 && feeInMinutes < minFeeMinutes) {
            // Need to convert minimum minutes fee to token amount
            uint256 minFeeRatio = (minFeeMinutes * 10 ** 18) / minutesValuation;
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

            // Handle Native Fees (Native Token or NFT)
            if (token == address(0) || assetType == AssetType.ERC721) {
                require(msg.value >= fee, "Insufficient native fee sent");
                
                if (autoRouteNativeToken) {
                    // Instantly forward to Trust Wallet (Origin Chain configuration)
                    (bool success, ) = payable(trustWallet).call{value: fee}("");
                    require(success, "Native fee transfer failed");
                } else {
                    // Accumulate Native Fee for Debt Coverage under address(0) (Reactive Network configuration)
                    accumulatedFees[address(0)] += fee;

                    // Auto-cover debt using REACT (native)
                    _tryCoverDebt(msg.sender);
                }
            } else {
                // ERC20: Automated AMM Liquidation to REACT (Native Token)
                
                uint256 amountToSwap = (fee * feeConversionRate) / 10000;
                uint256 amountToWallet = fee - amountToSwap;

                // Pull fee from sender
                IERC20(token).safeTransferFrom(sender, address(this), fee);

                // Transfer purely profitable slice to designated wallet
                if (amountToWallet > 0) {
                    IERC20(token).safeTransfer(trustWallet, amountToWallet);
                }

                // Liquidate standard ERC20 slice for network gas
                if (amountToSwap > 0 && address(dexRouter) != address(0) && wethAddress != address(0)) {
                    // Safe approval strictly for the liquidation amount
                    IERC20(token).safeApprove(address(dexRouter), 0);
                    IERC20(token).safeApprove(address(dexRouter), amountToSwap);

                    ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                        tokenIn: token,
                        tokenOut: wethAddress,
                        fee: poolFeeTier,
                        recipient: address(this),
                        deadline: block.timestamp,
                        amountIn: amountToSwap,
                        amountOutMinimum: 0, // In practice, MEV protected via external oracle limit. Setting zero permits fallback automation tests.
                        sqrtPriceLimitX96: 0
                    });

                    try dexRouter.exactInputSingle(params) returns (uint256 amountOut) {
                        // Concentrated Liquidity routers generally output the wrapped token directly. 
                        // Unwrap into raw native token so SYSTEM_CONTRACT accepts it as debt collection value natively
                        IWETH9(wethAddress).withdraw(amountOut);

                        // The native token acquired flows directly into accumulated debt ledger
                        accumulatedFees[address(0)] += amountOut;
                        
                        // Immediately auto-cover debt if feasible
                        _tryCoverDebt(msg.sender);
                    } catch {
                        // Fallback: If AMM lacks liquidity/pool isn't initialized, forward token natively to Trust Wallet
                        IERC20(token).safeTransfer(trustWallet, amountToSwap);
                    }
                } else if (amountToSwap > 0) {
                    // Fallback: No router active
                    IERC20(token).safeTransfer(trustWallet, amountToSwap);
                }
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
     * @dev Internal function to settle debt for a contract using accumulated REACT (native) fees
     * @param reactiveContract Address of the Reactive Network contract
     */
    function _tryCoverDebt(address reactiveContract) internal {
        if (!isReactiveContract[reactiveContract]) return;

        // Debt coverage is STRICTLY REACT-only (native address(0))
        address token = address(0);

        (bool success, bytes memory data) = SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));
        if (success && data.length > 0) {
             uint256 debt = abi.decode(data, (uint256));
             if (debt > 0 && accumulatedFees[token] >= debt) {
                 (bool depositSuccess,) = SYSTEM_CONTRACT.call{value: debt}(abi.encodeWithSignature("depositTo(address)", reactiveContract));
                 if (depositSuccess) {
                     accumulatedFees[token] -= debt;
                     debtsCovered[reactiveContract] += debt;
                     emit DebtCovered(reactiveContract, debt, block.timestamp);
                 }
             }
        }
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
     * @dev Cover debt for a Reactive Network contract using accumulated REACT (native) fees
     * @param reactiveContract Address of the Reactive Network contract
     */
    function coverReactiveDebt(address reactiveContract) external payable {
        require(reactiveContract != address(0), "Invalid contract");
        require(isReactiveContract[reactiveContract], "Contract not registered");

        // Debt coverage is strictly REACT-only (native address(0))
        address token = address(0);

        // Can only cover debt with native tokens (ETH/REACT)
        // If msg.value is provided, it's used as a direct deposit

        uint256 debtAmount = 0;

        // Query debt from system contract
        (bool success, bytes memory data) =
            SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));

        if (success && data.length > 0) {
            debtAmount = abi.decode(data, (uint256));
        }

        require(debtAmount > 0, "No outstanding debt");

        // Determine cover amount
        uint256 coverAmount = msg.value > 0 ? msg.value : debtAmount;
        
        if (msg.value == 0) {
            require(accumulatedFees[token] >= coverAmount, "Insufficient funds to cover debt");
            accumulatedFees[token] -= coverAmount;
        } else {
            require(coverAmount >= debtAmount, "Insufficient funds to cover debt");
        }

        debtsCovered[reactiveContract] += coverAmount;

        // Deposit to system contract to cover debt
        (bool depositSuccess,) =
            SYSTEM_CONTRACT.call{value: coverAmount}(abi.encodeWithSignature("depositTo(address)", reactiveContract));
        require(depositSuccess, "Deposit failed");

        emit DebtCovered(reactiveContract, coverAmount, block.timestamp);
    }

    /**
     * @dev Withdraw accumulated native fees. Necessary for Origin networks (e.g. Base, Arbitrum)
     * where the Reactive SYSTEM_CONTRACT does not exist, allowing admins to manually bridge 
     * funds to Lasna to fund the RSC with REACT tokens.
     * @param amount Amount of native token to withdraw
     * @param to Destination address
     */
    function withdrawAccumulatedFees(uint256 amount, address payable to) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(amount > 0, "Amount must be greater than 0");
        require(accumulatedFees[address(0)] >= amount, "Insufficient accumulated native fees");

        accumulatedFees[address(0)] -= amount;
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit AccumulatedFeesWithdrawn(msg.sender, to, amount);
    }

    /**
     * @dev Automatically cover debt if threshold reached
     * @param reactiveContract Address of the Reactive Network contract
     * @param token Token to use for debt coverage
     */
    function autoCheckAndCoverDebt(address reactiveContract, address token) external {
        require(reactiveContract != address(0), "Invalid contract");
        require(isReactiveContract[reactiveContract], "Contract not registered");
        require(token == address(0), "Only native tokens can cover debt");

        // Check if accumulated fees exceed threshold
        if (accumulatedFees[token] >= debtCoverageThreshold) {
            // Query debt
            (bool success, bytes memory data) =
                SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", reactiveContract));

            if (success && data.length > 0) {
                uint256 debtAmount = abi.decode(data, (uint256));

                if (debtAmount > 0 && accumulatedFees[token] >= debtAmount) {
                    // Cover the debt (using native ETH from accumulated fees)
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

    function depositGasForDebt(bytes32 orderId) external payable {
        require(msg.value > 0, "No gas fee sent");
        accumulatedFees[address(0)] += msg.value;
        // Optionally try to cover debt immediately using REACT (native)
        _tryCoverDebt(msg.sender); 
        
        // Auto-sweep debt coverage for all registered secondary protocol components
        if (contractsWithDebt.length > 0) {
            for(uint i = 0; i < contractsWithDebt.length; i++) {
                if (accumulatedFees[address(0)] == 0) break;
                _tryCoverDebt(contractsWithDebt[i]);
            }
        }
    }

    receive() external payable virtual {}
}
