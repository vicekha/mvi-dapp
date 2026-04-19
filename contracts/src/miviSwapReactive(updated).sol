// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractPausableReactive.sol";

/**
 * @title MviSwapReactiveTestnet
 * @notice Testnet version of MviSwapReactive for Lasna Testnet (chain ID 5318007).
 *         Fixes:
 *         - REACTIVE_CHAIN_ID: 5318007 (Lasna Testnet) instead of 1597 (Mainnet)
 *         - ORDER_INITIATED_TOPIC_0: corrected keccak256 hash
 */
contract MviSwapReactiveHardened is AbstractPausableReactive {

    // ═══════════════════════════════════════════════════════════════════════
    //  Constants
    // ═══════════════════════════════════════════════════════════════════════

    uint256 private constant REACTIVE_CHAIN_ID = 5318007; // Lasna Testnet

    /// @dev keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)")
    /// Verified with: cast keccak "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)"
    uint256 private constant ORDER_INITIATED_TOPIC_0 =
        0x058e802e2eed1657b621f4c6666f47d07adc8268c419f51940b8d60d9ff78dca;

    /// @dev topic_0 for our self-emitted MatchFound event.
    uint256 private constant MATCH_FOUND_TOPIC_0 =
        uint256(keccak256("MatchFound(bytes32,bytes32,address,address,uint256,uint256,uint256,uint256,address,address)"));

    /// @dev Lifecycle topics for pruning
    uint256 private constant ORDER_CANCELLED_TOPIC_0 = uint256(keccak256("OrderCancelled(bytes32,string,uint256)"));
    uint256 private constant ORDER_FILLED_TOPIC_0    = uint256(keccak256("OrderFilled(bytes32,uint256,uint256,uint256)"));
    uint256 private constant ORDER_EXPIRED_TOPIC_0   = uint256(keccak256("OrderExpired(bytes32,uint256)"));
    uint256 private constant ORDER_REBOOKED_TOPIC_0  = uint256(keccak256("OrderRebooked(bytes32,uint8,uint256)"));

    uint64  private constant CALLBACK_GAS_LIMIT = 2_000_000;
    address private constant RN_CALLBACK_PROXY  = 0x0000000000000000000000000000000000fffFfF;

    // ═══════════════════════════════════════════════════════════════════════
    //  Types
    // ═══════════════════════════════════════════════════════════════════════

    enum AssetType   { ERC20, ERC721 }
    enum OrderStatus { Active, Filled, PartiallyFilled, Cancelled, Expired, Matched }

    struct ChainConfig {
        uint256 chainId;
        address walletSwap;
        bool    active;
    }

    struct CrossChainOrder {
        bytes32   orderId;
        address   maker;
        address   tokenIn;
        address   tokenOut;
        AssetType typeIn;
        AssetType typeOut;
        uint256   amountIn;
        uint256   amountOut;
        uint256   targetChainId;
        uint256   sourceChainId;
        uint256   timestamp;
        uint256   expiration;
        OrderStatus status;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════════════════════════════════

    mapping(uint256 => ChainConfig) public chains;
    uint256[] public chainIds;
    mapping(bytes32 => CrossChainOrder) public orders;
    mapping(uint256 => mapping(address => mapping(address => bytes32[]))) public ordersByPair;

    // ═══════════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════════

    event MatchFound(
        bytes32 indexed orderIdA,
        bytes32 indexed orderIdB,
        address makerA,
        address makerB,
        uint256 amountInA,
        uint256 amountInB,
        uint256 sourceChainA,
        uint256 sourceChainB,
        address contractA,
        address contractB
    );

    event OrderReceived(
        bytes32 indexed orderId,
        uint256 indexed sourceChainId,
        uint256 indexed targetChainId,
        address maker
    );

    event MatchExecutionSent(
        bytes32 indexed orderId,
        uint256 indexed targetChain,
        address beneficiary,
        uint256 amount
    );

    event ChainAdded(uint256 indexed chainId, address walletSwap);
    event ChainRemoved(uint256 indexed chainId);

    // ═══════════════════════════════════════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════════════════════════════════════

    modifier callbackOnly() {
        require(msg.sender == RN_CALLBACK_PROXY, "Callback proxy only");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════════════════════════════════

    constructor(
        address _owner,
        uint256[] memory _initialChainIds,
        address[] memory _initialContracts
    ) payable {
        require(_initialChainIds.length == _initialContracts.length, "Length mismatch");
        owner = _owner;

        for (uint256 i = 0; i < _initialChainIds.length; i++) {
            uint256 cid = _initialChainIds[i];
            address cc  = _initialContracts[i];
            require(cid != 0 && cc != address(0), "Invalid chain config");

            chains[cid] = ChainConfig({ chainId: cid, walletSwap: cc, active: true });
            chainIds.push(cid);
        }

        if (!vm) {
            for (uint256 i = 0; i < _initialChainIds.length; i++) {
                service.subscribe(
                    _initialChainIds[i],
                    _initialContracts[i],
                    ORDER_INITIATED_TOPIC_0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
                // Subscribe to lifecycle events for pruning
                service.subscribe(_initialChainIds[i], _initialContracts[i], ORDER_CANCELLED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
                service.subscribe(_initialChainIds[i], _initialContracts[i], ORDER_FILLED_TOPIC_0,    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
                service.subscribe(_initialChainIds[i], _initialContracts[i], ORDER_EXPIRED_TOPIC_0,   REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
                service.subscribe(_initialChainIds[i], _initialContracts[i], ORDER_REBOOKED_TOPIC_0,  REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
            }

            service.subscribe(
                REACTIVE_CHAIN_ID,
                address(this),
                MATCH_FOUND_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  react()
    // ═══════════════════════════════════════════════════════════════════════

    function react(LogRecord calldata log) external vmOnly {
        if (log.topic_0 == ORDER_INITIATED_TOPIC_0) {
            _onOrderInitiated(log);
        } else if (log.topic_0 == MATCH_FOUND_TOPIC_0 && log._contract == address(this)) {
            _onMatchFound(log);
        } else if (log.topic_0 == ORDER_CANCELLED_TOPIC_0) {
            _onOrderCancelled(log);
        } else if (log.topic_0 == ORDER_FILLED_TOPIC_0) {
            _onOrderFilled(log);
        } else if (log.topic_0 == ORDER_EXPIRED_TOPIC_0) {
            _onOrderExpired(log);
        } else if (log.topic_0 == ORDER_REBOOKED_TOPIC_0) {
            _onOrderRebooked(log);
        }
    }

    function _onOrderInitiated(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        address maker   = address(uint160(uint256(log.topic_2)));

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

        if (targetChainId == 0 || targetChainId == sourceChainId) return;
        if (!chains[targetChainId].active) return;

        bytes memory payload = abi.encodeWithSignature(
            "persistAndMatch(address,bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256,uint256)",
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

    function _onOrderCancelled(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        bytes memory payload = abi.encodeWithSignature(
            "pruneOrder(address,bytes32,uint8)",
            address(0),
            orderId,
            uint8(OrderStatus.Cancelled)
        );
        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
    }

    function _onOrderFilled(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        // log.data contains filledAmount, remainingAmount, timestamp
        (,uint256 remainingAmount,) = abi.decode(log.data, (uint256, uint256, uint256));
        
        if (remainingAmount == 0) {
            bytes memory payload = abi.encodeWithSignature(
                "pruneOrder(address,bytes32,uint8)",
                address(0),
                orderId,
                uint8(OrderStatus.Filled)
            );
            emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
        }
    }

    function _onOrderExpired(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        bytes memory payload = abi.encodeWithSignature(
            "pruneOrder(address,bytes32,uint8)",
            address(0),
            orderId,
            uint8(OrderStatus.Expired)
        );
        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
    }

    function _onOrderRebooked(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        // log.data contains attempt (uint8) and newExpiry (uint256)
        (,uint256 newExpiry) = abi.decode(log.data, (uint8, uint256));
        bytes memory payload = abi.encodeWithSignature(
            "updateExpiry(address,bytes32,uint256)",
            address(0),
            orderId,
            newExpiry
        );
        emit Callback(REACTIVE_CHAIN_ID, address(this), CALLBACK_GAS_LIMIT, payload);
    }

    function _onMatchFound(LogRecord calldata log) internal {
        bytes32 orderIdA = bytes32(log.topic_1);
        bytes32 orderIdB = bytes32(log.topic_2);

        (
            address makerA,
            address makerB,
            uint256 amountInA,
            uint256 amountInB,
            uint256 sourceChainA,
            uint256 sourceChainB,
            address contractA,
            address contractB
        ) = abi.decode(
            log.data,
            (address, address, uint256, uint256, uint256, uint256, address, address)
        );

        bytes memory payloadA = abi.encodeWithSignature(
            "executeInterChainOrder(address,bytes32,address,uint256)",
            address(0),
            orderIdA,
            makerB,
            amountInA
        );
        emit Callback(sourceChainA, contractA, CALLBACK_GAS_LIMIT, payloadA);
        emit MatchExecutionSent(orderIdA, sourceChainA, makerB, amountInA);

        bytes memory payloadB = abi.encodeWithSignature(
            "executeInterChainOrder(address,bytes32,address,uint256)",
            address(0),
            orderIdB,
            makerA,
            amountInB
        );
        emit Callback(sourceChainB, contractB, CALLBACK_GAS_LIMIT, payloadB);
        emit MatchExecutionSent(orderIdB, sourceChainB, makerA, amountInB);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  callbackOnly — state persistence
    // ═══════════════════════════════════════════════════════════════════════

    function persistAndMatch(
        address,
        bytes32 orderId,
        address maker,
        address tokenIn,
        address tokenOut,
        uint8   typeInRaw,
        uint8   typeOutRaw,
        uint256 amountIn,
        uint256 amountOut,
        uint256 targetChainId,
        uint256 sourceChainId,
        uint256 timestamp
    ) external callbackOnly {
        if (!chains[targetChainId].active) return;
        if (orders[orderId].maker != address(0)) return;

        AssetType typeIn  = AssetType(typeInRaw);
        AssetType typeOut = AssetType(typeOutRaw);

        orders[orderId] = CrossChainOrder({
            orderId:       orderId,
            maker:         maker,
            tokenIn:       tokenIn,
            tokenOut:      tokenOut,
            typeIn:        typeIn,
            typeOut:       typeOut,
            amountIn:      amountIn,
            amountOut:     amountOut,
            targetChainId: targetChainId,
            sourceChainId: sourceChainId,
            timestamp:     timestamp,
            expiration:    0,
            status:        OrderStatus.Active
        });

        ordersByPair[targetChainId][tokenOut][tokenIn].push(orderId);

        emit OrderReceived(orderId, sourceChainId, targetChainId, maker);

        bytes32[] storage candidates = ordersByPair[sourceChainId][tokenIn][tokenOut];

        for (uint256 i = 0; i < candidates.length; i++) {
            bytes32 candidateId = candidates[i];
            if (candidateId == orderId) continue;

            CrossChainOrder storage c = orders[candidateId];

            if (c.status != OrderStatus.Active) continue;
            if (c.sourceChainId != targetChainId) continue;
            if (c.targetChainId != sourceChainId) continue;
            if (c.tokenIn != tokenOut || c.tokenOut != tokenIn) continue;
            if (c.typeIn != typeOut   || c.typeOut != typeIn)   continue;

            if (!_checkAmountCompatibility(typeOut, amountOut, c.amountIn, typeIn, amountIn, c.amountOut)) {
                continue;
            }

            orders[orderId].status = OrderStatus.Matched;
            c.status = OrderStatus.Matched;

            emit MatchFound(
                orderId,
                candidateId,
                maker,
                c.maker,
                amountIn,
                c.amountIn,
                sourceChainId,
                c.sourceChainId,
                chains[sourceChainId].walletSwap,
                chains[c.sourceChainId].walletSwap
            );

            return;
        }
    }

    function pruneOrder(address, bytes32 orderId, uint8 newStatus) external callbackOnly {
        CrossChainOrder storage order = orders[orderId];
        if (order.maker == address(0)) return;
        if (order.status != OrderStatus.Active) return;
        
        // Remove from ordersByPair index
        bytes32[] storage list = ordersByPair[order.targetChainId][order.tokenOut][order.tokenIn];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == orderId) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }

        order.status = OrderStatus(newStatus);
    }

    function updateExpiry(address, bytes32 orderId, uint256 newExpiry) external callbackOnly {
        if (orders[orderId].maker == address(0)) return;
        orders[orderId].expiration = newExpiry;
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

    // ═══════════════════════════════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════════════════════════════

    function addChain(uint256 chainId, address walletSwap) external rnOnly onlyOwner {
        require(chainId != 0 && walletSwap != address(0), "Invalid");
        require(!chains[chainId].active, "Already registered");

        chains[chainId] = ChainConfig({ chainId: chainId, walletSwap: walletSwap, active: true });
        chainIds.push(chainId);

        service.subscribe(chainId, walletSwap, ORDER_INITIATED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.subscribe(chainId, walletSwap, ORDER_CANCELLED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.subscribe(chainId, walletSwap, ORDER_FILLED_TOPIC_0,    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.subscribe(chainId, walletSwap, ORDER_EXPIRED_TOPIC_0,   REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.subscribe(chainId, walletSwap, ORDER_REBOOKED_TOPIC_0,  REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        emit ChainAdded(chainId, walletSwap);
    }

    function removeChain(uint256 chainId) external rnOnly onlyOwner {
        ChainConfig storage cfg = chains[chainId];
        require(cfg.active, "Not registered");

        service.unsubscribe(chainId, cfg.walletSwap, ORDER_INITIATED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.unsubscribe(chainId, cfg.walletSwap, ORDER_CANCELLED_TOPIC_0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.unsubscribe(chainId, cfg.walletSwap, ORDER_FILLED_TOPIC_0,    REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.unsubscribe(chainId, cfg.walletSwap, ORDER_EXPIRED_TOPIC_0,   REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        service.unsubscribe(chainId, cfg.walletSwap, ORDER_REBOOKED_TOPIC_0,  REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        cfg.active = false;

        for (uint256 i = 0; i < chainIds.length; i++) {
            if (chainIds[i] == chainId) {
                chainIds[i] = chainIds[chainIds.length - 1];
                chainIds.pop();
                break;
            }
        }
        emit ChainRemoved(chainId);
    }

    function getOrder(bytes32 orderId) external view returns (CrossChainOrder memory) {
        return orders[orderId];
    }

    function getRegisteredChains() external view returns (uint256[] memory) {
        return chainIds;
    }

    function emergencyCancelOrder(bytes32 orderId) external rnOnly onlyOwner {
        CrossChainOrder storage order = orders[orderId];
        require(order.status == OrderStatus.Active, "Not active");
        order.status = OrderStatus.Cancelled;
    }

    function withdrawETH(uint256 amount) external rnOnly onlyOwner {
        require(amount <= address(this).balance, "Insufficient");
        (bool ok,) = payable(owner).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function getPausableSubscriptions()
        internal
        view
        override
        returns (Subscription[] memory)
    {
        uint256 count = (chainIds.length * 5) + 1;
        Subscription[] memory subs = new Subscription[](count);

        for (uint256 i = 0; i < chainIds.length; i++) {
            ChainConfig storage cfg = chains[chainIds[i]];
            // Subscriptions for each chain
            subs[i*5] = Subscription({
                chain_id:  cfg.chainId,
                _contract: cfg.walletSwap,
                topic_0:   ORDER_INITIATED_TOPIC_0,
                topic_1:   REACTIVE_IGNORE,
                topic_2:   REACTIVE_IGNORE,
                topic_3:   REACTIVE_IGNORE
            });
            subs[i*5 + 1] = Subscription({
                chain_id:  cfg.chainId,
                _contract: cfg.walletSwap,
                topic_0:   ORDER_CANCELLED_TOPIC_0,
                topic_1:   REACTIVE_IGNORE,
                topic_2:   REACTIVE_IGNORE,
                topic_3:   REACTIVE_IGNORE
            });
            subs[i*5 + 2] = Subscription({
                chain_id:  cfg.chainId,
                _contract: cfg.walletSwap,
                topic_0:   ORDER_FILLED_TOPIC_0,
                topic_1:   REACTIVE_IGNORE,
                topic_2:   REACTIVE_IGNORE,
                topic_3:   REACTIVE_IGNORE
            });
            subs[i*5 + 3] = Subscription({
                chain_id:  cfg.chainId,
                _contract: cfg.walletSwap,
                topic_0:   ORDER_EXPIRED_TOPIC_0,
                topic_1:   REACTIVE_IGNORE,
                topic_2:   REACTIVE_IGNORE,
                topic_3:   REACTIVE_IGNORE
            });
            subs[i*5 + 4] = Subscription({
                chain_id:  cfg.chainId,
                _contract: cfg.walletSwap,
                topic_0:   ORDER_REBOOKED_TOPIC_0,
                topic_1:   REACTIVE_IGNORE,
                topic_2:   REACTIVE_IGNORE,
                topic_3:   REACTIVE_IGNORE
            });
        }

        subs[count - 1] = Subscription({
            chain_id:  REACTIVE_CHAIN_ID,
            _contract: address(this),
            topic_0:   MATCH_FOUND_TOPIC_0,
            topic_1:   REACTIVE_IGNORE,
            topic_2:   REACTIVE_IGNORE,
            topic_3:   REACTIVE_IGNORE
        });

        return subs;
    }

    receive() external payable override(AbstractPayer, IPayer) {}
}
