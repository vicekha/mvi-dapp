// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractReactive.sol";

/**
 * @title SwapMatcherRSC3_TriChain
 * @notice RSC 3.0 with tri-chain support: Lasna, Sepolia, Base Sepolia
 * @dev Uses simplified RNK/RVM model from RSC 3.0 with extended chain support
 */
contract SwapMatcherRSC3_TriChain is IReactive, AbstractReactive {
    // ============ Constants ============
    
    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 private constant LASNA_CHAIN_ID = 5318007;
    uint256 private constant REACTIVE_CHAIN_ID = 5318007;
    
    uint256 private constant ORDER_INITIATED_TOPIC_0 = 
        uint256(keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)"));
    
    uint256 private constant ORDER_STORED_TOPIC_0 =
        uint256(keccak256("OrderStored(bytes32,uint256,address,address,uint8,uint8,uint256,uint256,uint256)"));
    
    uint64 private constant CALLBACK_GAS_LIMIT = 2000000;
    
    enum AssetType { ERC20, ERC721 }
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
    
    // ============ State Variables ============
    
    address public immutable owner;
    address public sepoliaWalletSwapMain;
    address public baseSepoliaWalletSwapMain;
    address public lasnaWalletSwapMain;
    
    mapping(bytes32 => CrossChainOrder) public orders;
    mapping(uint256 => bytes32[]) public chainOrders;
    mapping(uint256 => mapping(address => mapping(address => bytes32[]))) public ordersByPair;
    mapping(uint256 => uint256) public orderCount;
    
    // ============ Events ============
    
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
    event ContractInitialized(address owner, address sepoliaContract, address baseSepoliaContract, address lasnaContract);
    
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
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(
        address _owner,
        address _sepoliaWalletSwapMain,
        address _baseSepoliaWalletSwapMain,
        address _lasnaWalletSwapMain
    ) payable {
        require(_owner != address(0), "Invalid owner");
        require(_sepoliaWalletSwapMain != address(0), "Invalid Sepolia contract");
        require(_baseSepoliaWalletSwapMain != address(0), "Invalid Base Sepolia contract");
        require(_lasnaWalletSwapMain != address(0), "Invalid Lasna contract");
        
        owner = _owner;
        sepoliaWalletSwapMain = _sepoliaWalletSwapMain;
        baseSepoliaWalletSwapMain = _baseSepoliaWalletSwapMain;
        lasnaWalletSwapMain = _lasnaWalletSwapMain;
        
        // Subscribe to events (only in deployment, not in VM mode)
        if (!vm) {
            // Subscribe to Sepolia
            service.subscribe(
                SEPOLIA_CHAIN_ID,
                _sepoliaWalletSwapMain,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            
            // Subscribe to Base Sepolia
            service.subscribe(
                BASE_SEPOLIA_CHAIN_ID,
                _baseSepoliaWalletSwapMain,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            
            // Subscribe to Lasna
            service.subscribe(
                LASNA_CHAIN_ID,
                _lasnaWalletSwapMain,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            
            // Subscribe to own OrderStored events
            service.subscribe(
                REACTIVE_CHAIN_ID,
                address(this),
                ORDER_STORED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
        
        emit ContractInitialized(_owner, _sepoliaWalletSwapMain, _baseSepoliaWalletSwapMain, _lasnaWalletSwapMain);
    }
    
    // ============ Main Reaction Logic (RVM) ============
    
    function react(LogRecord calldata log) external vmOnly {
        if (log.topic_0 == ORDER_INITIATED_TOPIC_0) {
            if (log._contract == sepoliaWalletSwapMain || 
                log._contract == baseSepoliaWalletSwapMain || 
                log._contract == lasnaWalletSwapMain) {
                _handleOrderInitiated(log);
            }
        }
        else if (log.topic_0 == ORDER_STORED_TOPIC_0 && log._contract == address(this)) {
            _handleOrderStored(log);
        }
    }
    
    function _handleOrderInitiated(LogRecord calldata log) internal {
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
            return;
        }
        
        // Validate target chain (must be one of our 3 supported chains)
        if (targetChainId != SEPOLIA_CHAIN_ID && 
            targetChainId != BASE_SEPOLIA_CHAIN_ID && 
            targetChainId != LASNA_CHAIN_ID) {
            return;
        }
        
        bytes memory payload = abi.encodeWithSignature(
            "storeOrder(address,bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint256)",
            address(0),
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
        
        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
    }
    
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
        
        bytes memory payload = abi.encodeWithSignature(
            "findAndExecuteMatch(address,bytes32,uint256,address,address,uint8,uint8,uint256,uint256,uint256)",
            address(0),
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
    
    // ============ RNK Callback Functions ============
    
    function storeOrder(
        address,
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
        
        chainOrders[sourceChainId].push(orderId);
        orderCount[sourceChainId]++;
        ordersByPair[targetChainId][tokenOut][tokenIn].push(orderId);
        
        emit OrderReceived(orderId, sourceChainId, targetChainId, maker, tokenIn, tokenOut, amountIn, amountOut);
        emit OrderStored(orderId, targetChainId, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, sourceChainId);
    }
    
    function findAndExecuteMatch(
        address,
        bytes32 newOrderId,
        uint256 targetChainId,
        address tokenIn,
        address tokenOut,
        uint8 typeInRaw,
        uint8 typeOutRaw,
        uint256 amountIn,
        uint256 amountOut,
        uint256 sourceChainId
    ) external {
        CrossChainOrder storage newOrder = orders[newOrderId];
        
        if (newOrder.status != OrderStatus.Active) {
            return;
        }
        
        bytes32[] storage potentialMatches = ordersByPair[sourceChainId][tokenIn][tokenOut];
        
        for (uint256 i = 0; i < potentialMatches.length; i++) {
            bytes32 candidateId = potentialMatches[i];
            CrossChainOrder storage candidate = orders[candidateId];
            
            if (candidate.status != OrderStatus.Active) continue;
            if (candidate.sourceChainId != targetChainId) continue;
            if (candidate.targetChainId != sourceChainId) continue;
            if (candidate.tokenIn != tokenOut || candidate.tokenOut != tokenIn) continue;
            
            AssetType typeIn = AssetType(typeInRaw);
            AssetType typeOut = AssetType(typeOutRaw);
            
            if (candidate.typeIn != typeOut || candidate.typeOut != typeIn) continue;
            
            bool amountsMatch = _checkAmountCompatibility(
                typeOut, amountOut, candidate.amountIn,
                typeIn, amountIn, candidate.amountOut
            );
            
            if (!amountsMatch) continue;
            
            _executeMatchInternal(newOrderId, candidateId);
            return;
        }
    }
    
    function _executeMatchInternal(bytes32 orderIdA, bytes32 orderIdB) internal {
        CrossChainOrder storage orderA = orders[orderIdA];
        CrossChainOrder storage orderB = orders[orderIdB];
        
        orderA.status = OrderStatus.Matched;
        orderB.status = OrderStatus.Matched;
        
        emit MatchFound(orderIdA, orderIdB, orderA.sourceChainId, orderB.sourceChainId, block.timestamp);
        
        _sendExecutionCallback(orderA.sourceChainId, orderA.orderId, orderB.maker, orderA.amountIn);
        _sendExecutionCallback(orderB.sourceChainId, orderB.orderId, orderA.maker, orderB.amountIn);
    }
    
    function _checkAmountCompatibility(
        AssetType typeA, uint256 amountA, uint256 requiredA,
        AssetType typeB, uint256 amountB, uint256 requiredB
    ) internal pure returns (bool) {
        if (typeA == AssetType.ERC721 || typeB == AssetType.ERC721) {
            return amountA == requiredA && amountB == requiredB;
        }
        return amountA >= requiredA && amountB >= requiredB;
    }
    
    function _sendExecutionCallback(
        uint256 targetChainId,
        bytes32 orderId,
        address beneficiary,
        uint256 amount
    ) internal {
        address targetContract;
        
        if (targetChainId == SEPOLIA_CHAIN_ID) {
            targetContract = sepoliaWalletSwapMain;
        } else if (targetChainId == BASE_SEPOLIA_CHAIN_ID) {
            targetContract = baseSepoliaWalletSwapMain;
        } else {
            targetContract = lasnaWalletSwapMain;
        }
        
        bytes memory payload = abi.encodeWithSignature(
            "executeInterChainOrder(address,bytes32,address,uint256)",
            address(this),
            orderId,
            beneficiary,
            amount
        );
        
        emit Callback(targetChainId, targetContract, CALLBACK_GAS_LIMIT, payload);
        emit MatchExecutionInitiated(orderId, targetChainId, beneficiary, amount);
    }
    
    // ============ View Functions ============
    
    function getOrder(bytes32 orderId) external view returns (CrossChainOrder memory) {
        return orders[orderId];
    }
    
    function getChainOrders(uint256 chainId) external view returns (bytes32[] memory) {
        return chainOrders[chainId];
    }
    
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
    
    function getOrdersByPair(uint256 chainId, address tokenIn, address tokenOut) external view returns (bytes32[] memory) {
        return ordersByPair[chainId][tokenIn][tokenOut];
    }
    
    // ============ Admin Functions ============
    
    function updateContracts(
        address _sepoliaWalletSwapMain,
        address _baseSepoliaWalletSwapMain,
        address _lasnaWalletSwapMain
    ) external onlyOwner {
        require(_sepoliaWalletSwapMain != address(0), "Invalid Sepolia");
        require(_baseSepoliaWalletSwapMain != address(0), "Invalid Base Sepolia");
        require(_lasnaWalletSwapMain != address(0), "Invalid Lasna");
        
        sepoliaWalletSwapMain = _sepoliaWalletSwapMain;
        baseSepoliaWalletSwapMain = _baseSepoliaWalletSwapMain;
        lasnaWalletSwapMain = _lasnaWalletSwapMain;
    }
    
    function emergencyCancelOrder(bytes32 orderId) external onlyOwner {
        CrossChainOrder storage order = orders[orderId];
        require(order.status == OrderStatus.Active, "Order not active");
        order.status = OrderStatus.Cancelled;
        emit OrderCancelled(orderId, order.sourceChainId);
    }
    
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success,) = payable(owner).call{value: amount}("");
        require(success, "ETH transfer failed");
    }
    
    function withdrawAllETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH");
        (bool success,) = payable(owner).call{value: balance}("");
        require(success, "ETH transfer failed");
    }
    
    receive() external payable override(AbstractPayer, IPayer) {}
}
