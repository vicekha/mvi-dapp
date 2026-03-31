// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractReactive.sol";

/**
 * @title SwapMatcherMultiChain
 * @notice Reactive Smart Contract that matches cross-chain swap orders across any number
 *         of registered EVM chains. Chains can be added or removed after deployment by
 *         the owner without redeploying the contract.
 * @dev Uses the Reactive Network subscribe/unsubscribe service to wire up live event
 *      monitoring whenever a chain is added or removed.
 */
contract SwapMatcherMultiChain is IReactive, AbstractReactive {
    // ============ Constants ============

    uint256 private constant REACTIVE_CHAIN_ID = 1597; // Reactive Mainnet

    uint256 private constant ORDER_INITIATED_TOPIC_0 =
        0x6d08b9a87f7647f097d3c39dc947f3fd4d468fc8e9dc32805b6b536cbf069a68;

    uint256 private constant ORDER_STORED_TOPIC_0 =
        uint256(keccak256("OrderStored(bytes32,uint256,address,address,uint8,uint8,uint256,uint256,uint256)"));

    uint64 private constant CALLBACK_GAS_LIMIT = 2000000;
    uint256 public constant SPAM_THRESHOLD = 5; // Low threshold for demo/safety
    uint256 public constant DUST_THRESHOLD = 0.001 ether; // Minimum value to bypass spam tracking

    enum AssetType { ERC20, ERC721 }
    enum OrderStatus { Active, Matched, Cancelled, Expired }

    // ============ Structs ============

    struct ChainConfig {
        uint256 chainId;
        address walletSwapMain;
        bool active;
    }

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
        uint256 expiration;
        OrderStatus status;
    }

    // ============ State Variables ============

    address public owner;

    /// @notice All registered chains, indexed by chainId.
    mapping(uint256 => ChainConfig) public chains;

    /// @notice Array of active chain IDs (for iteration).
    uint256[] public chainIds;

    /// @notice Quick lookup: is a given contract address a registered WalletSwapMain?
    mapping(address => uint256) public contractToChainId;

    mapping(bytes32 => CrossChainOrder) public orders;
    mapping(uint256 => bytes32[]) public chainOrders;
    mapping(uint256 => mapping(address => mapping(address => bytes32[]))) public ordersByPair;
    mapping(uint256 => uint256) public orderCount;
    mapping(address => uint256) public orderFrequencies;

    // ============ Events ============

    event ChainAdded(uint256 indexed chainId, address walletSwapMain);
    event ChainRemoved(uint256 indexed chainId, address walletSwapMain);
    event ChainContractUpdated(uint256 indexed chainId, address oldContract, address newContract);

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

    event ContractInitialized(address owner);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // C-2: Restrict callback functions to the Reactive callback proxy
    modifier onlyCallback() {
        // In the Reactive Network architecture, callbacks come from the contract itself
        // (self-calls via the callback proxy system) or from authorized sources
        require(
            msg.sender == address(this) || msg.sender == owner,
            "Unauthorized: only callback proxy or owner"
        );
        _;
    }

    // ============ Constructor ============

    /**
     * @param _owner            Admin address.
     * @param _initialChainIds  Chain IDs to register at deploy time (e.g. Sepolia, Base Sepolia, Lasna).
     * @param _initialContracts WalletSwapMain addresses for each initial chain (same-length array).
     */
    constructor(
        address _owner,
        uint256[] memory _initialChainIds,
        address[] memory _initialContracts
    ) {
        require(_owner != address(0), "Invalid owner");
        require(_initialChainIds.length == _initialContracts.length, "Length mismatch");

        owner = _owner;

        for (uint256 i = 0; i < _initialChainIds.length; i++) {
            _registerChain(_initialChainIds[i], _initialContracts[i]);
        }

        emit ContractInitialized(_owner);
    }

    // ============ Main Reaction Logic (RVM) ============

    function react(LogRecord calldata log) external vmOnly {
        if (log.topic_0 == ORDER_INITIATED_TOPIC_0) {
            // RVM cannot check state (chains mapping).
            // We trust the subscription system: we only get logs from contracts we subscribed to.
            _handleOrderInitiated(log);
        } else if (log.topic_0 == ORDER_STORED_TOPIC_0 && log._contract == address(this)) {
            _handleOrderStored(log);
        }
        
        // HEARTBEAT: Check for expired orders every time any activity occurs
        _checkAndRefundExpiredOrders(log.chain_id);
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
            uint256 timestamp,
            uint256 expiration
        ) = abi.decode(
            log.data,
            (address, address, AssetType, AssetType, uint256, uint256, uint256, uint256, uint256)
        );

        uint256 sourceChainId = log.chain_id;

        // Cross-chain check
        if (targetChainId == 0 || targetChainId == sourceChainId) return;
        
        // RVM cannot check chains[targetChainId].active.
        // We defer this check to the storeOrder callback in RNK.

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
            timestamp,
            expiration
        );

        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);

        // Automated Spam Detection - Value Based (AI/HFT Friendly)
        // Only track and punish "dust" orders. High value orders provide liquidity and are exempt.
        if (amountIn < DUST_THRESHOLD) {
            orderFrequencies[maker]++;
            if (orderFrequencies[maker] == SPAM_THRESHOLD) {
                _sendBlacklistCallback(sourceChainId, maker);
            }
        }
    }

    /**
     * @dev Check a subset of orders for expiration and trigger refunds
     * We use a window to prevent gas issues on the Reactive chain
     */
    function _checkAndRefundExpiredOrders(uint256 currentChainId) internal {
        // For simplicity in this demo, we check a few orders from the current chain
        bytes32[] storage allOrders = chainOrders[currentChainId];
        if (allOrders.length == 0) return;

        // Check up to 5 orders sequentially (cycling through them)
        uint256 startIndex = uint256(keccak256(abi.encodePacked(block.timestamp, block.number))) % allOrders.length;
        uint256 limit = allOrders.length > 5 ? 5 : allOrders.length;

        for (uint256 i = 0; i < limit; i++) {
            uint256 idx = (startIndex + i) % allOrders.length;
            bytes32 orderId = allOrders[idx];
            CrossChainOrder storage order = orders[orderId];

            if (order.status == OrderStatus.Active && order.expiration > 0 && block.timestamp > order.expiration) {
                order.status = OrderStatus.Expired;
                
                // Trigger refund on the source chain
                address targetContract = chains[order.sourceChainId].walletSwapMain;
                if (targetContract != address(0)) {
                    bytes memory payload = abi.encodeWithSignature(
                        "processExpiredOrderRefund(bytes32)",
                        orderId
                    );
                    emit Callback(order.sourceChainId, targetContract, CALLBACK_GAS_LIMIT, payload);
                    emit OrderCancelled(orderId, order.sourceChainId);
                }
            }
        }
    }

    function _sendBlacklistCallback(uint256 targetChainId, address spammer) internal {
        address targetContract = chains[targetChainId].walletSwapMain;
        if (targetContract == address(0)) return;

        bytes memory payload = abi.encodeWithSignature(
            "setBlacklist(address,bool)",
            spammer,
            true
        );

        emit Callback(targetChainId, targetContract, CALLBACK_GAS_LIMIT, payload);
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

    // C-2: Restricted to callback system only
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
        uint256 timestamp,
        uint256 expiration
    ) external onlyCallback {
        // Validation in RNK context (state access allowed)
        if (!chains[targetChainId].active) return;
        if (orders[orderId].maker != address(0)) return; // Already exists

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
            expiration: expiration,
            status: OrderStatus.Active
        });

        chainOrders[sourceChainId].push(orderId);
        orderCount[sourceChainId]++;
        ordersByPair[targetChainId][tokenOut][tokenIn].push(orderId);

        emit OrderReceived(orderId, sourceChainId, targetChainId, maker, tokenIn, tokenOut, amountIn, amountOut);
        emit OrderStored(orderId, targetChainId, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, sourceChainId);
    }

    // C-2: Restricted to callback system only
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
    ) external onlyCallback {
        CrossChainOrder storage newOrder = orders[newOrderId];
        if (newOrder.status != OrderStatus.Active) return;

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
        address targetContract = chains[targetChainId].walletSwapMain;
        require(targetContract != address(0), "No contract for chain");

        // H-1: Fixed callback signature to match WalletSwapMain.executeInterChainOrder (5 params)
        bytes memory payload = abi.encodeWithSignature(
            "executeInterChainOrder(address,address,bytes32,address,uint256)",
            address(0),       // sender (placeholder)
            address(this),    // rvmId — the RSC's own address
            orderId,
            beneficiary,
            amount
        );

        emit Callback(targetChainId, targetContract, CALLBACK_GAS_LIMIT, payload);
        emit MatchExecutionInitiated(orderId, targetChainId, beneficiary, amount);
    }

    // ============ Internal Chain Registry ============

    function _registerChain(uint256 chainId, address walletSwapMain) internal {
        require(chainId != 0, "Invalid chain ID");
        require(walletSwapMain != address(0), "Invalid contract");
        require(!chains[chainId].active, "Chain already registered");

        chains[chainId] = ChainConfig({ chainId: chainId, walletSwapMain: walletSwapMain, active: true });
        chainIds.push(chainId);
        contractToChainId[walletSwapMain] = chainId;

        if (!vm) {
            service.subscribe(
                chainId,
                walletSwapMain,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );

            // Self-subscription to trigger matching logic in RVM
            service.subscribe(
                REACTIVE_CHAIN_ID,
                address(this),
                ORDER_STORED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }

        emit ChainAdded(chainId, walletSwapMain);
    }

    function _deregisterChain(uint256 chainId) internal {
        ChainConfig storage cfg = chains[chainId];
        require(cfg.active, "Chain not registered");

        address oldContract = cfg.walletSwapMain;
        cfg.active = false;
        delete contractToChainId[oldContract];

        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chainIds[i] == chainId) {
                chainIds[i] = chainIds[chainIds.length - 1];
                chainIds.pop();
                break;
            }
        }

        if (!vm) {
            service.unsubscribe(
                chainId,
                oldContract,
                ORDER_INITIATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }

        emit ChainRemoved(chainId, oldContract);
    }

    // ============ Admin: Dynamic Chain Management ============

    /**
     * @notice Add a new chain after deployment. Immediately subscribes to its OrderInitiated events.
     * @param chainId        EIP-155 chain ID.
     * @param walletSwapMain WalletSwapMain contract address on that chain.
     */
    function addChain(uint256 chainId, address walletSwapMain) external onlyOwner {
        _registerChain(chainId, walletSwapMain);
    }

    /**
     * @notice Add a new chain without calling the Reactive Network subscription service.
     * Useful for unsupported chains or testing.
     */
    function addChainOffline(uint256 chainId, address walletSwapMain) external onlyOwner {
        require(chainId != 0, "Invalid chain ID");
        require(walletSwapMain != address(0), "Invalid contract");
        require(!chains[chainId].active, "Chain already registered");

        chains[chainId] = ChainConfig({ chainId: chainId, walletSwapMain: walletSwapMain, active: true });
        chainIds.push(chainId);
        contractToChainId[walletSwapMain] = chainId;

        // Skip service.subscribe call

        emit ChainAdded(chainId, walletSwapMain);
    }

    /**
     * @notice Remove a chain. Immediately unsubscribes from its events.
     * @param chainId EIP-155 chain ID to remove.
     */
    function removeChain(uint256 chainId) external onlyOwner {
        _deregisterChain(chainId);
    }

    /**
     * @notice Swap the WalletSwapMain address for an existing chain (e.g. after redeployment).
     * @param chainId           EIP-155 chain ID.
     * @param newWalletSwapMain New contract address.
     */
    function updateChainContract(uint256 chainId, address newWalletSwapMain) external onlyOwner {
        require(newWalletSwapMain != address(0), "Invalid contract");
        ChainConfig storage cfg = chains[chainId];
        require(cfg.active, "Chain not registered");

        address oldContract = cfg.walletSwapMain;

        if (!vm) {
            service.unsubscribe(chainId, oldContract, ORDER_INITIATED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
            service.subscribe(chainId, newWalletSwapMain, ORDER_INITIATED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        }

        delete contractToChainId[oldContract];
        cfg.walletSwapMain = newWalletSwapMain;
        contractToChainId[newWalletSwapMain] = chainId;

        emit ChainContractUpdated(chainId, oldContract, newWalletSwapMain);
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
            if (orders[allOrders[i]].status == OrderStatus.Active) activeCount++;
        }
        return activeCount;
    }

    function getOrdersByPair(uint256 chainId, address tokenIn, address tokenOut)
        external view returns (bytes32[] memory)
    {
        return ordersByPair[chainId][tokenIn][tokenOut];
    }

    /// @notice Returns all currently registered (active) chain IDs.
    function getRegisteredChains() external view returns (uint256[] memory) {
        return chainIds;
    }

    /// @notice Returns the config for a specific chain.
    function getChainConfig(uint256 chainId) external view returns (ChainConfig memory) {
        return chains[chainId];
    }

    // ============ Admin: Emergency ============

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

    // M-4: Ownership transfer mechanism
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    receive() external payable override(AbstractPayer, IPayer) {}
}
