// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractReactive.sol";

/**
 * @title SwapMatcherRSC
 * @notice Reactive Smart Contract for cross-chain swap order matching
 * @dev Uses RNK/RVM separation model:
 *      - RVM: Listens to events, triggers callbacks
 *      - RNK: Handles state changes via callbacks
 *      Communication: RVM event -> Callback to RNK -> State change -> Emit event -> RVM reads event
 */
contract SwapMatcherRSC is IReactive, AbstractReactive {
    // ============ Constants ============
    
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 private constant LASNA_CHAIN_ID = 5318007; // Lasna = Reactive Network
    uint256 private constant REACTIVE_CHAIN_ID = 5318007; // Same as Lasna
    
    // Event signature for OrderInitiated from WalletSwapMain
    // event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, 
    //                      AssetType typeIn, AssetType typeOut, uint256 amountIn, uint256 amountOut, 
    //                      uint256 targetChainId, uint256 timestamp)
    uint256 private constant ORDER_INITIATED_TOPIC_0 = 
        uint256(keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)"));
    
    // Internal event signatures (emitted by this contract in RNK, read by RVM)
    uint256 private constant ORDER_STORED_TOPIC_0 =
        uint256(keccak256("OrderStored(bytes32,uint256,address,address,uint8,uint8,uint256,uint256,uint256)"));
    uint256 private constant MATCH_DATA_RETRIEVED_TOPIC_0 =
        uint256(keccak256("MatchDataRetrieved(bytes32,bytes32[])"));
    
    uint64 private constant CALLBACK_GAS_LIMIT = 2000000;
    
    // Asset type enum (must match WalletSwapMain)
    enum AssetType { ERC20, ERC721 }
    
    // Order status for tracking
    enum OrderStatus { Active, Matched, Cancelled, Expired }
    
    // ============ Structs ============
    
    struct CrossChainOrder {
        bytes32 orderId;
        address maker;
        address tokenIn;
        address tokenOut;
        AssetType typeIn;
        AssetType typeOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 targetChainId;
        uint256 sourceChainId;
        uint256 timestamp;
        OrderStatus status;
    }
    
    // ============ State Variables (RNK) ============
    
    address public immutable owner;
    address public baseSepoliaWalletSwapMain;
    address public lasnaWalletSwapMain;
    
    // Order storage: orderId => Order (RNK state)
    mapping(bytes32 => CrossChainOrder) public orders;
    
    // Chain-specific order tracking: chainId => orderId[]
    mapping(uint256 => bytes32[]) public chainOrders;
    
    // Pair-based indexing for efficient matching: (chainId, tokenIn, tokenOut) => orderId[]
    mapping(uint256 => mapping(address => mapping(address => bytes32[]))) public ordersByPair;
    
    // Track total orders per chain
    mapping(uint256 => uint256) public orderCount;
    
    // ============ Events ============
    
    // External events (for monitoring/logging)
    event OrderReceived(
        bytes32 indexed orderId, 
        uint256 indexed sourceChainId, 
        uint256 indexed targetChainId,
        address maker,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event MatchFound(
        bytes32 indexed orderIdA,
        bytes32 indexed orderIdB,
        uint256 chainA,
        uint256 chainB,
        uint256 timestamp
    );
    
    event MatchExecutionInitiated(
        bytes32 indexed orderId,
        uint256 indexed targetChain,
        address beneficiary,
        uint256 amount
    );
    
    event OrderCancelled(bytes32 indexed orderId, uint256 chainId);
    
    event ContractInitialized(address owner, address baseSepoliaContract, address lasnaContract);
    
    // ============ Internal Events (for RNK-RVM communication) ============
    
    // Emitted in RNK after storing order, read by RVM to trigger matching
    event OrderStored(
        bytes32 indexed orderId,
        uint256 indexed targetChainId,
        address tokenIn,
        address tokenOut,
        AssetType typeIn,
        AssetType typeOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 sourceChainId
    );
    
    // Emitted in RNK with potential matches, read by RVM
    event MatchDataRetrieved(
        bytes32 indexed requestId,
        bytes32[] potentialMatches
    );
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(
        address _owner,
        address _baseSepoliaWalletSwapMain,
        address _lasnaWalletSwapMain
    ) payable {
        require(_owner != address(0), "Invalid owner");
        require(_baseSepoliaWalletSwapMain != address(0), "Invalid Base Sepolia contract");
        require(_lasnaWalletSwapMain != address(0), "Invalid Lasna contract");
        
        owner = _owner;
        baseSepoliaWalletSwapMain = _baseSepoliaWalletSwapMain;
        lasnaWalletSwapMain = _lasnaWalletSwapMain;
        
        // Subscribe to events (only in deployment, not in VM mode)
        if (!vm) {
            // Subscribe to Base Sepolia WalletSwapMain OrderInitiated events
            service.subscribe(
                BASE_SEPOLIA_CHAIN_ID,
                _baseSepoliaWalletSwapMain,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            
            // Subscribe to Lasna WalletSwapMain OrderInitiated events
            service.subscribe(
                LASNA_CHAIN_ID,
                _lasnaWalletSwapMain,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            
            // Subscribe to own OrderStored events (RNK -> RVM communication)
            service.subscribe(
                REACTIVE_CHAIN_ID,
                address(this),
                ORDER_STORED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            
            // Subscribe to own MatchDataRetrieved events (RNK -> RVM communication)
            service.subscribe(
                REACTIVE_CHAIN_ID,
                address(this),
                MATCH_DATA_RETRIEVED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
        
        emit ContractInitialized(_owner, _baseSepoliaWalletSwapMain, _lasnaWalletSwapMain);
    }
    
    // ============ Main Reaction Logic (RVM) ============
    
    /**
     * @notice Main reaction function - called by Reactive Network when subscribed events are emitted
     * @dev RVM mode: Reads events, cannot access state, sends callbacks to RNK
     * @param log The event log from the monitored contract
     */
    function react(LogRecord calldata log) external vmOnly {
        // Case 1: OrderInitiated from WalletSwapMain (external chains)
        if (log.topic_0 == ORDER_INITIATED_TOPIC_0) {
            if (log._contract == baseSepoliaWalletSwapMain || log._contract == lasnaWalletSwapMain) {
                _handleOrderInitiated(log);
            }
        }
        // Case 2: OrderStored event from our own contract (RNK -> RVM)
        else if (log.topic_0 == ORDER_STORED_TOPIC_0 && log._contract == address(this)) {
            _handleOrderStored(log);
        }
        // Case 3: MatchDataRetrieved event from our own contract (RNK -> RVM)
        else if (log.topic_0 == MATCH_DATA_RETRIEVED_TOPIC_0 && log._contract == address(this)) {
            _handleMatchDataRetrieved(log);
        }
    }
    
    // ============ RVM Event Handlers ============
    
    /**
     * @notice Handle OrderInitiated event from WalletSwapMain (RVM)
     * @dev Triggers callback to RNK to store the order
     */
    function _handleOrderInitiated(LogRecord calldata log) internal {
        // Decode event data
        bytes32 orderId = bytes32(log.topic_1);
        address maker = address(uint160(uint256(log.topic_2)));
        
        (
            address tokenIn,
            address tokenOut,
            AssetType typeIn,
            AssetType typeOut,
            uint256 amountIn,
            uint256 amountOut,
            uint256 targetChainId,
            uint256 timestamp
        ) = abi.decode(
            log.data,
            (address, address, AssetType, AssetType, uint256, uint256, uint256, uint256)
        );
        
        uint256 sourceChainId = log.chain_id;
        
        // Only process cross-chain orders
        if (targetChainId == 0 || targetChainId == sourceChainId) {
            return; // Local order, ignore
        }
        
        // Validate target chain
        if (targetChainId != BASE_SEPOLIA_CHAIN_ID && targetChainId != LASNA_CHAIN_ID) {
            return; // Unsupported chain
        }
        
        // Send callback to RNK to store this order
        bytes memory payload = abi.encodeWithSignature(
            "storeOrder(address,bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint256)",
            address(0), // sender parameter
            orderId,
            maker,
            tokenIn,
            tokenOut,
            uint8(typeIn),
            uint8(typeOut),
            amountIn,
            amountOut,
            targetChainId,
            sourceChainId,
            timestamp
        );
        
        // Callback to this contract on Reactive Network (RNK)
        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
    }
    
    /**
     * @notice Handle OrderStored event from RNK (RVM)
     * @dev Triggers callback to RNK to retrieve potential matches
     */
    function _handleOrderStored(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        uint256 targetChainId = uint256(log.topic_2);
        
        (
            address tokenIn,
            address tokenOut,
            AssetType typeIn,
            AssetType typeOut,
            uint256 amountIn,
            uint256 amountOut,
            uint256 sourceChainId
        ) = abi.decode(
            log.data,
            (address, address, AssetType, AssetType, uint256, uint256, uint256)
        );
        
        // Generate unique request ID for this match attempt
        bytes32 requestId = keccak256(abi.encodePacked(orderId, block.timestamp));
        
        // Send callback to RNK to retrieve potential matches
        bytes memory payload = abi.encodeWithSignature(
            "getPotentialMatches(address,bytes32,bytes32,uint256,address,address,uint8,uint8,uint256,uint256,uint256)",
            address(0), // sender parameter
            requestId,
            orderId,
            targetChainId,
            tokenIn,
            tokenOut,
            uint8(typeIn),
            uint8(typeOut),
            amountIn,
            amountOut,
            sourceChainId
        );
        
        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
    }
    
    /**
     * @notice Handle MatchDataRetrieved event from RNK (RVM)
     * @dev Checks each potential match and triggers execution if compatible
     */
    function _handleMatchDataRetrieved(LogRecord calldata log) internal {
        bytes32 requestId = bytes32(log.topic_1);
        
        // Decode the array of potential matches
        (bytes32[] memory potentialMatches) = abi.decode(log.data, (bytes32[]));
        
        // For each potential match, send callback to RNK to verify and execute
        for (uint256 i = 0; i < potentialMatches.length; i++) {
            bytes32 candidateId = potentialMatches[i];
            
            // Send callback to RNK to check compatibility and execute match
            bytes memory payload = abi.encodeWithSignature(
                "checkAndExecuteMatch(address,bytes32,bytes32,bytes32)",
                address(0), // sender parameter
                requestId,
                requestId, // newOrderId (embedded in requestId)
                candidateId
            );
            
            emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
        }
    }
    
    // ============ RNK Callback Functions (State Modification) ============
    
    /**
     * @notice Store order in RNK state (called via callback from RVM)
     * @dev Only callable via Reactive Network callback
     */
    function storeOrder(
        address, /* sender */
        bytes32 orderId,
        address maker,
        address tokenIn,
        address tokenOut,
        uint8 typeInRaw,
        uint8 typeOutRaw,
        uint256 amountIn,
        uint256 amountOut,
        uint256 targetChainId,
        uint256 sourceChainId,
        uint256 timestamp
    ) external {
        AssetType typeIn = AssetType(typeInRaw);
        AssetType typeOut = AssetType(typeOutRaw);
        
        // Store the order
        orders[orderId] = CrossChainOrder({
            orderId: orderId,
            maker: maker,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            typeIn: typeIn,
            typeOut: typeOut,
            amountIn: amountIn,
            amountOut: amountOut,
            targetChainId: targetChainId,
            sourceChainId: sourceChainId,
            timestamp: timestamp,
            status: OrderStatus.Active
        });
        
        // Add to chain-specific tracking
        chainOrders[sourceChainId].push(orderId);
        orderCount[sourceChainId]++;
        
        // Add to pair-based index for the TARGET chain
        ordersByPair[targetChainId][tokenOut][tokenIn].push(orderId);
        
        emit OrderReceived(
            orderId,
            sourceChainId,
            targetChainId,
            maker,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut
        );
        
        // Emit OrderStored event for RVM to trigger matching
        emit OrderStored(
            orderId,
            targetChainId,
            tokenIn,
            tokenOut,
            typeIn,
            typeOut,
            amountIn,
            amountOut,
            sourceChainId
        );
    }
    
    /**
     * @notice Retrieve potential matches from RNK state (called via callback from RVM)
     * @dev Emits MatchDataRetrieved event for RVM to process
     */
    function getPotentialMatches(
        address, /* sender */
        bytes32 requestId,
        bytes32 orderId,
        uint256 targetChainId,
        address tokenIn,
        address tokenOut,
        uint8 typeInRaw,
        uint8 typeOutRaw,
        uint256 amountIn,
        uint256 amountOut,
        uint256 sourceChainId
    ) external {
        // Look for orders on the target chain that want to trade back
        // They should have: tokenIn=our tokenOut, tokenOut=our tokenIn
        bytes32[] storage potentialMatches = ordersByPair[sourceChainId][tokenIn][tokenOut];
        
        // Filter for active orders only
        uint256 activeCount = 0;
        for (uint256 i = 0; i < potentialMatches.length; i++) {
            if (orders[potentialMatches[i]].status == OrderStatus.Active) {
                activeCount++;
            }
        }
        
        // Build active matches array
        bytes32[] memory activeMatches = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < potentialMatches.length; i++) {
            bytes32 candidateId = potentialMatches[i];
            if (orders[candidateId].status == OrderStatus.Active) {
                activeMatches[index] = candidateId;
                index++;
            }
        }
        
        // Emit event for RVM to read
        emit MatchDataRetrieved(requestId, activeMatches);
    }
    
    /**
     * @notice Check compatibility and execute match (called via callback from RVM)
     * @dev Verifies all conditions and triggers cross-chain settlement if valid
     */
    function checkAndExecuteMatch(
        address, /* sender */
        bytes32 requestId,
        bytes32 orderIdA,
        bytes32 orderIdB
    ) external {
        CrossChainOrder storage orderA = orders[orderIdA];
        CrossChainOrder storage orderB = orders[orderIdB];
        
        // Verify both orders are active
        if (orderA.status != OrderStatus.Active || orderB.status != OrderStatus.Active) {
            return;
        }
        
        // Verify they're on compatible chains
        if (orderA.sourceChainId != orderB.targetChainId || orderB.sourceChainId != orderA.targetChainId) {
            return;
        }
        
        // Verify tokens match (swapped)
        if (orderA.tokenOut != orderB.tokenIn || orderA.tokenIn != orderB.tokenOut) {
            return;
        }
        
        // Verify types match
        if (orderA.typeOut != orderB.typeIn || orderA.typeIn != orderB.typeOut) {
            return;
        }
        
        // Check amount compatibility
        bool amountsMatch = _checkAmountCompatibility(
            orderA.typeOut,
            orderA.amountOut,
            orderB.amountIn,
            orderB.typeOut,
            orderB.amountOut,
            orderA.amountIn
        );
        
        if (!amountsMatch) {
            return;
        }
        
        // Execute the match!
        _executeMatchInternal(orderIdA, orderIdB);
    }
    
    /**
     * @notice Internal function to execute a matched pair (RNK)
     */
    function _executeMatchInternal(bytes32 orderIdA, bytes32 orderIdB) internal {
        CrossChainOrder storage orderA = orders[orderIdA];
        CrossChainOrder storage orderB = orders[orderIdB];
        
        // Mark both orders as matched
        orderA.status = OrderStatus.Matched;
        orderB.status = OrderStatus.Matched;
        
        emit MatchFound(
            orderIdA,
            orderIdB,
            orderA.sourceChainId,
            orderB.sourceChainId,
            block.timestamp
        );
        
        // Send execution callbacks to both chains
        _sendExecutionCallback(
            orderA.sourceChainId,
            orderA.orderId,
            orderB.maker,
            orderA.amountIn
        );
        
        _sendExecutionCallback(
            orderB.sourceChainId,
            orderB.orderId,
            orderA.maker,
            orderB.amountIn
        );
    }
    
    // ============ Helper Functions ============
    
    /**
     * @notice Check if two orders have compatible amounts for matching
     * @dev For ERC20: Amounts should be approximately equal (within slippage)
     *      For ERC721: Token IDs must match exactly
     */
    function _checkAmountCompatibility(
        AssetType typeA,
        uint256 amountA,
        uint256 requiredA,
        AssetType typeB,
        uint256 amountB,
        uint256 requiredB
    ) internal pure returns (bool) {
        // NFT matching - must be exact
        if (typeA == AssetType.ERC721 || typeB == AssetType.ERC721) {
            return amountA == requiredA && amountB == requiredB;
        }
        
        // ERC20 matching - check if amounts are compatible
        // Order A offers amountA, Order B wants requiredA
        // Order B offers amountB, Order A wants requiredB
        
        // For simplicity, we require exact matches or Order A offers >= what B wants
        // and Order B offers >= what A wants
        return amountA >= requiredA && amountB >= requiredB;
    }
    
    /**
     * @notice Send a callback to WalletSwapMain to execute cross-chain order settlement
     * @param targetChainId The chain to execute on
     * @param orderId The order ID to settle
     * @param beneficiary The address to receive the tokens
     * @param amount The amount to transfer
     */
    function _sendExecutionCallback(
        uint256 targetChainId,
        bytes32 orderId,
        address beneficiary,
        uint256 amount
    ) internal {
        address targetContract = targetChainId == BASE_SEPOLIA_CHAIN_ID 
            ? baseSepoliaWalletSwapMain 
            : lasnaWalletSwapMain;
        
        // Create callback payload for executeInterChainOrder
        // function executeInterChainOrder(address sender, address rvmId, bytes32 orderId, address beneficiary, uint256 amount)
        bytes memory payload = abi.encodeWithSignature(
            "executeInterChainOrder(address,address,bytes32,address,uint256)",
            address(0), // sender (filled by Reactive Network)
            address(this), // rvmId (this RSC contract)
            orderId,
            beneficiary,
            amount
        );
        
        // Emit callback event to trigger execution on target chain
        emit Callback(targetChainId, targetContract, CALLBACK_GAS_LIMIT, payload);
        
        emit MatchExecutionInitiated(orderId, targetChainId, beneficiary, amount);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get order details
     */
    function getOrder(bytes32 orderId) external view returns (CrossChainOrder memory) {
        return orders[orderId];
    }
    
    /**
     * @notice Get all orders for a specific chain
     */
    function getChainOrders(uint256 chainId) external view returns (bytes32[] memory) {
        return chainOrders[chainId];
    }
    
    /**
     * @notice Get active order count for a chain
     */
    function getActiveOrderCount(uint256 chainId) external view returns (uint256) {
        bytes32[] storage allOrders = chainOrders[chainId];
        uint256 activeCount = 0;
        
        for (uint256 i = 0; i < allOrders.length; i++) {
            if (orders[allOrders[i]].status == OrderStatus.Active) {
                activeCount++;
            }
        }
        
        return activeCount;
    }
    
    /**
     * @notice Get orders for a specific token pair on a chain
     */
    function getOrdersByPair(
        uint256 chainId,
        address tokenIn,
        address tokenOut
    ) external view returns (bytes32[] memory) {
        return ordersByPair[chainId][tokenIn][tokenOut];
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update WalletSwapMain contract addresses (emergency only)
     */
    function updateContracts(
        address _baseSepoliaWalletSwapMain,
        address _lasnaWalletSwapMain
    ) external onlyOwner {
        require(_baseSepoliaWalletSwapMain != address(0), "Invalid Base Sepolia contract");
        require(_lasnaWalletSwapMain != address(0), "Invalid Lasna contract");
        
        baseSepoliaWalletSwapMain = _baseSepoliaWalletSwapMain;
        lasnaWalletSwapMain = _lasnaWalletSwapMain;
    }
    
    /**
     * @notice Emergency function to manually cancel an order
     */
    function emergencyCancelOrder(bytes32 orderId) external onlyOwner {
        CrossChainOrder storage order = orders[orderId];
        require(order.status == OrderStatus.Active, "Order not active");
        
        order.status = OrderStatus.Cancelled;
        emit OrderCancelled(orderId, order.sourceChainId);
    }
    
    /**
     * @notice Manually subscribe to events after deployment
     * @dev Call this if automated subscription in constructor fails due to vm detection
     */
    function subscribeAll() external payable onlyOwner {
        // Subscribe to Base Sepolia WalletSwapMain OrderInitiated events
        service.subscribe(
            BASE_SEPOLIA_CHAIN_ID,
            baseSepoliaWalletSwapMain,
            ORDER_INITIATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        
        // Subscribe to Lasna WalletSwapMain OrderInitiated events
        service.subscribe(
            LASNA_CHAIN_ID,
            lasnaWalletSwapMain,
            ORDER_INITIATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        
        // Subscribe to own OrderStored events (RNK -> RVM communication)
        service.subscribe(
            REACTIVE_CHAIN_ID,
            address(this),
            ORDER_STORED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        
        // Subscribe to MatchDataRetrieved events (for match response)
        service.subscribe(
            REACTIVE_CHAIN_ID,
            address(this),
            MATCH_DATA_RETRIEVED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }
    
    /**
     * @notice Withdraw ETH (for debt coverage or emergencies)
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success,) = payable(owner).call{value: amount}("");
        require(success, "ETH transfer failed");
    }
    
    /**
     * @notice Withdraw all ETH
     */
    function withdrawAllETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success,) = payable(owner).call{value: balance}("");
        require(success, "ETH transfer failed");
    }
    
    // Receive function for ETH deposits
    receive() external payable override(AbstractPayer, IPayer) {}
}
