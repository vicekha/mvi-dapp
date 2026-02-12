// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {VirtualLiquidityPool} from "./VirtualLiquidityPool.sol";
import {TrustWalletFeeDistributor} from "./TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "./AssetVerifier.sol";

interface IWalletSwapMain {
    function processExpiredOrderRefund(bytes32 orderId) external;
}

/**
 * @title EulerLagrangeOrderProcessor
 * @dev Processes orders using Euler-Lagrange optimization
 * Reactive Network Compliant - Emits events for order tracking and cross-chain callbacks
 */
contract EulerLagrangeOrderProcessor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Asset type enum
    enum AssetType {
        ERC20,
        ERC721
    }

    // Component contracts
    VirtualLiquidityPool public liquidityPool;
    TrustWalletFeeDistributor public feeDistributor;
    AssetVerifier public assetVerifier;
    address public walletSwapMain;

    // Order structure
    struct Order {
        address maker;
        address tokenIn;
        address tokenOut;
        AssetType typeIn;
        AssetType typeOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 minutesValueIn;
        uint256 minutesValueOut;
        uint256 slippageTolerance;
        uint256 filledAmount;
        uint256 timestamp;
        uint256 expiration;
        OrderStatus status;
        bool rebookEnabled;
        uint8 rebookAttempts;
        bytes32 verificationId;
        uint256 targetChainId;
    }

    // Order status enum
    enum OrderStatus {
        ACTIVE,
        FILLED,
        PARTIALLY_FILLED,
        CANCELLED,
        EXPIRED
    }

    // Order storage
    mapping(bytes32 => Order) public orders;
    bytes32[] public orderIds;

    // Order queue for priority processing
    bytes32[] public orderQueue;
    mapping(bytes32 => uint256) public orderSizes;

    // Automatic rebooking parameters
    uint256 public constant MINIMUM_ORDER_VALUE = 0; // lowered for testing to allow small orders
    uint256 public constant LARGE_ORDER_THRESHOLD = 500 * 10 ** 18; // 500 minutes
    uint256 public constant MEGA_ORDER_THRESHOLD = 1000 * 10 ** 18; // 1000 minutes
    uint256 public constant BPS_MAX = 10000; // 100% in basis points
    uint256 public constant LARGE_ORDER_REBOOK_THRESHOLD = 9000; // 90%
    uint256 public constant MEGA_ORDER_REBOOK_THRESHOLD = 1000; // 10%
    uint8 public constant MAX_REBOOK_ATTEMPTS = 3;

    // Rebooking queue
    bytes32[] public rebookQueue;
    mapping(bytes32 => uint256) public rebookTime;

    // Token whitelist
    // mapping(address => bool) public whitelistedTokens;

    // Token volume tracking
    mapping(address => mapping(uint256 => uint256)) public tokenMonthlyVolume;

    // Auto-matching: index orders by (tokenIn, tokenOut) for quick lookup
    // tokenIn => tokenOut => array of active order IDs
    mapping(address => mapping(address => bytes32[])) public ordersByPair;

    // Events - Reactive Network compliant
    event OrderCreated(
        bytes32 indexed orderId,
        address indexed maker,
        address indexed tokenIn,
        address tokenOut,
        AssetType typeIn,
        AssetType typeOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minutesValueIn,
        uint256 targetChainId,
        uint256 timestamp
    );
    event OrderFilled(bytes32 indexed orderId, uint256 filledAmount, uint256 remainingAmount, uint256 timestamp);
    event OrderPartiallyFilled(
        bytes32 indexed orderId, uint256 filledAmount, uint256 remainingAmount, uint256 timestamp
    );
    event OrderCancelled(bytes32 indexed orderId, string reason, uint256 timestamp);
    event OrderExpired(bytes32 indexed orderId, uint256 timestamp);
    event OrderRebooked(bytes32 indexed orderId, uint8 attempt, uint256 newExpiry);
    // event TokenWhitelisted(address indexed token);
    event CrossChainOrderCreated(bytes32 indexed orderId, uint256 targetChainId, uint256 timestamp);
    event OrderMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp);
    event OrderProcessorInitialized(address indexed owner);

    constructor(address _liquidityPool, address _feeDistributor, address _assetVerifier) {
        require(_liquidityPool != address(0), "Invalid liquidity pool");
        require(_feeDistributor != address(0), "Invalid fee distributor");
        require(_assetVerifier != address(0), "Invalid asset verifier");

        liquidityPool = VirtualLiquidityPool(_liquidityPool);
        feeDistributor = TrustWalletFeeDistributor(payable(_feeDistributor));
        assetVerifier = AssetVerifier(_assetVerifier);

        emit OrderProcessorInitialized(msg.sender);
    }

    /**
     * @dev Set the WalletSwapMain contract address
     * @param _walletSwapMain Address of WalletSwapMain
     */
    function setWalletSwapMain(address _walletSwapMain) external onlyOwner {
        require(_walletSwapMain != address(0), "Invalid address");
        walletSwapMain = _walletSwapMain;
    }

    /**
     * @dev Create a new token order
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param amountIn Input amount
     * @param amountOut Output amount
     * @param minutesValueIn Minutes valuation for input
     * @param minutesValueOut Minutes valuation for output
     * @param slippageTolerance Slippage tolerance
     * @param expiration Order expiration timestamp
     * @param enableRebooking Whether to enable automatic rebooking
     * @param targetChainId Target chain ID for cross-chain orders
     * @return orderId Order ID
     */
    function createOrder(
        address maker,
        address tokenIn,
        address tokenOut,
        AssetType typeIn,
        AssetType typeOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 minutesValueIn,
        uint256 minutesValueOut,
        uint256 slippageTolerance,
        uint256 expiration,
        bool enableRebooking,
        uint256 targetChainId
    ) external nonReentrant returns (bytes32) {
        // Allow address(0) for native ETH. Both can be active ONLY if cross-chain (targetChainId != block.chainid)
        require(
            tokenIn != address(0) || tokenOut != address(0) || targetChainId != block.chainid,
            "Both tokens cannot be native on same chain"
        );
        // Whitelist check removed
        // require(
        //     whitelistedTokens[tokenIn] || whitelistedTokens[tokenOut] || tokenIn == address(0)
        //         || tokenOut == address(0),
        //     "Token not whitelisted"
        // );
        require(amountIn > 0 && amountOut > 0, "Invalid amounts");
        require(minutesValueIn >= MINIMUM_ORDER_VALUE, "Order value too small");
        require(minutesValueIn > 0 && minutesValueOut > 0, "Invalid minutes valuation");
        require(expiration > block.timestamp, "Invalid expiration");

        // Generate order ID
        // forge-lint: disable-next-line(asm-keccak256)
        bytes32 orderId = keccak256(
            abi.encodePacked(
                maker,
                tokenIn,
                tokenOut,
                typeIn,
                typeOut,
                amountIn,
                amountOut,
                minutesValueIn,
                minutesValueOut,
                block.timestamp,
                block.number
            )
        );

        // Initialize order
        Order storage newOrder = orders[orderId];
        newOrder.maker = maker;
        newOrder.tokenIn = tokenIn;
        newOrder.tokenOut = tokenOut;
        newOrder.typeIn = typeIn;
        newOrder.typeOut = typeOut;
        newOrder.amountIn = amountIn;
        newOrder.amountOut = amountOut;
        newOrder.minutesValueIn = minutesValueIn;
        newOrder.minutesValueOut = minutesValueOut;
        newOrder.slippageTolerance = slippageTolerance;
        newOrder.timestamp = block.timestamp;
        newOrder.expiration = expiration;
        newOrder.status = OrderStatus.ACTIVE;
        newOrder.rebookEnabled = enableRebooking;
        newOrder.targetChainId = targetChainId;

        // Verify assets using AssetVerifier
        if (typeIn == AssetType.ERC721) {
            newOrder.verificationId = assetVerifier.verifyNft(tokenIn, maker, amountIn);
        } else {
            // For Native ETH sent via WalletSwapMain, funds are already deposited
            // So we skip balance check (which would fail as user just sent funds)
            if (tokenIn == address(0) && msg.sender == walletSwapMain) {
                // Generate verification ID locally without calling AssetVerifier
                // forge-lint: disable-next-line(asm-keccak256)
                newOrder.verificationId =
                    keccak256(abi.encodePacked(tokenIn, maker, amountIn, block.timestamp, block.number));
            } else {
                newOrder.verificationId = assetVerifier.verifyToken(tokenIn, maker, amountIn);
            }
        }

        // Add to order tracking
        orderIds.push(orderId);
        orderSizes[orderId] = minutesValueIn;
        _insertOrderInQueue(orderId, minutesValueIn);

        // Add to virtual liquidity pool
        liquidityPool.addLiquidity(tokenIn, tokenOut, minutesValueIn);

        // Track volume
        uint256 month = block.timestamp / 30 days;
        tokenMonthlyVolume[tokenIn][month] += minutesValueIn;

        emit OrderCreated(
            orderId, maker, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, minutesValueIn, targetChainId, block.timestamp
        );

        // Add to pair index for auto-matching (All orders now included to allow shadow matching/RSC pool consistency)
        ordersByPair[tokenIn][tokenOut].push(orderId);


        if (targetChainId != 0 && targetChainId != block.chainid) {
            emit CrossChainOrderCreated(orderId, targetChainId, block.timestamp);
        }

        return orderId;
    }

    /**
     * @dev Cancel an active order
     * @param orderId Order ID to cancel
     */
    function cancelOrder(bytes32 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        require(order.maker == msg.sender || msg.sender == owner() || msg.sender == walletSwapMain, "Unauthorized");
        require(
            order.status == OrderStatus.ACTIVE || order.status == OrderStatus.PARTIALLY_FILLED, "Order not cancellable"
        );

        order.status = OrderStatus.CANCELLED;

        // Reduce virtual liquidity by the unfilled portion
        uint256 remainingValue = order.minutesValueIn
            - ((order.filledAmount * order.minutesValueIn) / (order.amountOut == 0 ? 1 : order.amountOut));
        if (remainingValue > 0) {
            liquidityPool.reduceLiquidity(order.tokenIn, order.tokenOut, remainingValue);
        }

        emit OrderCancelled(orderId, "User cancelled", block.timestamp);
    }

    /**
     * @dev Update order status (restricted to authorized components)
     * @param orderId Order ID
     * @param newStatus New status
     */
    function updateOrderStatus(bytes32 orderId, OrderStatus newStatus) external {
        // Only allow owner or registered WalletSwapMain contract
        require(msg.sender == owner() || msg.sender == walletSwapMain, "Unauthorized");

        Order storage order = orders[orderId];
        order.status = newStatus;

        if (newStatus == OrderStatus.FILLED) {
            order.filledAmount = order.amountOut;
            emit OrderFilled(orderId, order.amountOut, 0, block.timestamp);

            // Reduce virtual liquidity
            liquidityPool.reduceLiquidity(order.tokenIn, order.tokenOut, order.minutesValueIn);
        }
    }

    function updateOrderFilledState(bytes32 orderId, uint256 newFilledAmount, OrderStatus newStatus) external {
        require(msg.sender == owner() || msg.sender == walletSwapMain, "Unauthorized");
        Order storage order = orders[orderId];
        order.filledAmount = newFilledAmount;
        order.status = newStatus;

        if (newStatus == OrderStatus.FILLED) {
             emit OrderFilled(orderId, newFilledAmount, 0, block.timestamp);
             liquidityPool.reduceLiquidity(order.tokenIn, order.tokenOut, order.minutesValueIn);
        } else if (newStatus == OrderStatus.PARTIALLY_FILLED) {
             emit OrderPartiallyFilled(orderId, newFilledAmount, order.amountOut > newFilledAmount ? order.amountOut - newFilledAmount : 0, block.timestamp);
        }
    }

    /**
     * @dev Process pending orders
     */
    function processOrders() external nonReentrant {
        for (uint256 i = 0; i < orderQueue.length; i++) {
            bytes32 orderId = orderQueue[i];
            Order storage order = orders[orderId];

            // Check expiration
            if (block.timestamp > order.expiration) {
                if (order.status == OrderStatus.ACTIVE) {
                    _handleExpiredOrder(orderId);
                }
            }
        }
    }

    /**
     * @dev Handle expired order
     * @param orderId Order ID
     */
    function _handleExpiredOrder(bytes32 orderId) internal {
        Order storage order = orders[orderId];

        // Check if eligible for rebooking
        if (order.rebookEnabled && order.rebookAttempts < MAX_REBOOK_ATTEMPTS) {
            uint256 fillPercentage = (order.filledAmount * BPS_MAX) / order.amountOut;

            // Determine rebook threshold based on order size
            uint256 threshold;
            if (order.minutesValueIn > MEGA_ORDER_THRESHOLD) {
                threshold = MEGA_ORDER_REBOOK_THRESHOLD;
            } else if (order.minutesValueIn > LARGE_ORDER_THRESHOLD) {
                threshold = LARGE_ORDER_REBOOK_THRESHOLD;
            } else {
                threshold = 5000; // 50% default
            }

            // If fill percentage is below threshold, rebook
            if (fillPercentage < threshold) {
                _rebookOrder(orderId);
            } else {
                // Met threshold, mark as complete
                order.status = OrderStatus.FILLED;
                emit OrderFilled(orderId, order.filledAmount, 0, block.timestamp);
            }
        } else {
            // No rebooking, mark as expired
            order.status = OrderStatus.EXPIRED;
            emit OrderExpired(orderId, block.timestamp);

            // Trigger refund in main contract
            if (walletSwapMain != address(0)) {
                // We use try/catch to ensure order processing doesn't revert if refund fails
                // (Though main contract requires success, we want the order to be marked expired regardless)
                try IWalletSwapMain(walletSwapMain).processExpiredOrderRefund(orderId) {} catch {}
            }
        }
    }

    /**
     * @dev Rebook an order
     * @param orderId Order ID
     */
    function _rebookOrder(bytes32 orderId) internal {
        Order storage order = orders[orderId];

        // Increment attempt counter
        order.rebookAttempts++;

        // Set new expiration (half the original duration)
        uint256 originalDuration = order.expiration - order.timestamp;
        uint256 extensionTime = originalDuration / 2;
        order.expiration = block.timestamp + extensionTime;

        // Reset filled amount for new booking
        order.filledAmount = 0;
        order.status = OrderStatus.ACTIVE;

        // Add to rebook queue
        rebookQueue.push(orderId);
        rebookTime[orderId] = block.timestamp;

        emit OrderRebooked(orderId, order.rebookAttempts, order.expiration);
    }

    /**
     * @dev Insert order in priority queue (smallest first)
     * @param orderId Order ID
     * @param size Order size
     */
    function _insertOrderInQueue(bytes32 orderId, uint256 size) internal {
        uint256 insertIndex = orderQueue.length;

        for (uint256 i = 0; i < orderQueue.length; i++) {
            if (orderSizes[orderQueue[i]] > size) {
                insertIndex = i;
                break;
            }
        }

        if (insertIndex == orderQueue.length) {
            orderQueue.push(orderId);
        } else {
            orderQueue.push(orderQueue[orderQueue.length - 1]);
            for (uint256 i = orderQueue.length - 2; i > insertIndex; i--) {
                orderQueue[i] = orderQueue[i - 1];
            }
            orderQueue[insertIndex] = orderId;
        }
    }

    /**
     * @dev Whitelist a token - DEPRECATED
     */
    function whitelistToken(
        address /* token */
    )
        external
        pure
    {
        // Deprecated: Whitelisting removed
        return;
    }

    /**
     * @dev Find a matching order for auto-swap (opposite token pair with compatible amounts)
     * @param tokenIn The input token of the order to match
     * @param tokenOut The output token of the order to match
     * @param amountIn The input amount of the order to match
     * @param amountOut The output amount the order wants to receive
     * @return matchedOrderId The matching order ID, or bytes32(0) if no match found
     */
    function findMatchingOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    ) external view returns (bytes32 matchedOrderId) {
        // Look for orders that want our tokenIn and offer our tokenOut
        // i.e., orders with (tokenOut -> tokenIn) pair
        bytes32[] storage candidates = ordersByPair[tokenOut][tokenIn];
        
        for (uint256 i = 0; i < candidates.length; i++) {
            bytes32 candidateId = candidates[i];
            Order storage candidate = orders[candidateId];
            
            // Skip if not active or expired
            if (candidate.status != OrderStatus.ACTIVE || block.timestamp > candidate.expiration) {
                continue;
            }
            
            // Check compatibility based on asset types
            bool isMatch = false;
            
            // Case 1: Both sides are fungible tokens (ERC20/native)
            if (candidate.typeIn == AssetType.ERC20 && candidate.typeOut == AssetType.ERC20) {
                // Standard amount matching: candidate offers enough, wants up to what we offer
                isMatch = (candidate.amountIn >= amountOut && candidate.amountOut <= amountIn);
            }
            // Case 2: Candidate offers NFT, wants fungible token
            else if (candidate.typeIn == AssetType.ERC721 && candidate.typeOut == AssetType.ERC20) {
                // Candidate has NFT, wants tokens. We have tokens, want NFT.
                // Match if candidate wants <= what we offer
                isMatch = (candidate.amountOut <= amountIn);
            }
            // Case 3: Candidate offers fungible, wants NFT
            else if (candidate.typeIn == AssetType.ERC20 && candidate.typeOut == AssetType.ERC721) {
                // Candidate has tokens, wants specific NFT. We have NFT, want tokens.
                // Match if candidate offers >= what we want AND wants our specific NFT
                isMatch = (candidate.amountIn >= amountOut && candidate.amountOut == amountIn);
            }
            // Case 4: Both sides are NFTs
            else if (candidate.typeIn == AssetType.ERC721 && candidate.typeOut == AssetType.ERC721) {
                // NFT for NFT swap - match by exact tokenIds
                isMatch = (candidate.amountOut == amountIn); // They want our NFT
            }
            
            if (isMatch) {
                return candidateId;
            }
        }
        
        return bytes32(0);
    }

    /**
     * @dev Remove an order from the pair index (called when order is filled/cancelled)
     * @param orderId The order ID to remove
     */
    function removeFromPairIndex(bytes32 orderId) external {
        require(msg.sender == walletSwapMain || msg.sender == owner(), "Unauthorized");
        Order storage order = orders[orderId];
        _removeFromPairIndex(orderId, order.tokenIn, order.tokenOut);
    }

    /**
     * @dev Internal function to remove order from pair index
     */
    function _removeFromPairIndex(bytes32 orderId, address tokenIn, address tokenOut) internal {
        bytes32[] storage pairOrders = ordersByPair[tokenIn][tokenOut];
        for (uint256 i = 0; i < pairOrders.length; i++) {
            if (pairOrders[i] == orderId) {
                // Swap with last and pop
                pairOrders[i] = pairOrders[pairOrders.length - 1];
                pairOrders.pop();
                break;
            }
        }
    }

    /**
     * @dev Get order details
     * @param orderId Order ID
     * @return Order record
     */
    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    /**
     * @dev Get order count
     * @return Number of orders
     */
    function getOrderCount() external view returns (uint256) {
        return orderIds.length;
    }

    /**
     * @dev Get order queue length
     * @return Queue length
     */
    function getOrderQueueLength() external view returns (uint256) {
        return orderQueue.length;
    }
}
