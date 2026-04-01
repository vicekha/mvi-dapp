// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractPausableReactive.sol";

/**
 * @title MviSwapReactive
 * @notice Reactive Contract (RC) for cross-chain order matching across Base, Ethereum, Sonic, and BNB.
 *
 * Architecture fix: The original SwapMatcherMultiChain emitted execution Callbacks from
 * callbackOnly functions (findAndExecuteMatch → _sendExecutionCallback). Per Reactive Network
 * rules, only Callbacks emitted from react() are dispatched — callbackOnly Callbacks are
 * silently dropped. This contract fixes the flow:
 *
 *   1. react() sees OrderInitiated on origin chain → self-Callback to persistAndMatch()
 *   2. persistAndMatch() [callbackOnly] stores order, attempts match.
 *      If match found → emits MatchFound event with ALL data needed for execution.
 *   3. react() sees MatchFound → emits execution Callbacks to BOTH chains' WalletSwapCallback.
 *
 * This ensures execution callbacks are ALWAYS emitted from react() (vmOnly context).
 */
contract MviSwapReactive is AbstractPausableReactive {

    // ═══════════════════════════════════════════════════════════════════════
    //  Constants
    // ═══════════════════════════════════════════════════════════════════════

    uint256 private constant REACTIVE_CHAIN_ID = 1597; // Reactive Mainnet

    /// @dev keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)")
    /// Precomputed topic_0 for the OrderInitiated event emitted by WalletSwapCallback on each chain.
    uint256 private constant ORDER_INITIATED_TOPIC_0 =
        0x6d08b9a87f7647f097d3c39dc947f3fd4d468fc8e9dc32805b6b536cbf069a68;

    /// @dev topic_0 for our self-emitted MatchFound event.
    uint256 private constant MATCH_FOUND_TOPIC_0 =
        uint256(keccak256("MatchFound(bytes32,bytes32,address,address,uint256,uint256,uint256,uint256,address,address)"));

    uint64  private constant CALLBACK_GAS_LIMIT = 2_000_000;
    address private constant RN_CALLBACK_PROXY  = 0x0000000000000000000000000000000000fffFfF;

    // ═══════════════════════════════════════════════════════════════════════
    //  Types
    // ═══════════════════════════════════════════════════════════════════════

    enum AssetType   { ERC20, ERC721 }
    enum OrderStatus { Active, Matched, Cancelled, Expired }

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
    //  State — written in constructor (visible to react()) or callbackOnly
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Chain registry. Constructor-written entries ARE visible to react().
    mapping(uint256 => ChainConfig) public chains;
    uint256[] public chainIds;

    /// @notice Order storage. Written by callbackOnly (invisible to react(), but that's fine
    /// because react() never reads orders directly — it gets all data from events).
    mapping(bytes32 => CrossChainOrder) public orders;

    /// @notice Matching index: targetChainId → tokenOut → tokenIn → orderIds
    mapping(uint256 => mapping(address => mapping(address => bytes32[]))) public ordersByPair;

    // ═══════════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Emitted by persistAndMatch() when two orders are matched.
    /// react() subscribes to this and emits execution callbacks to both chains.
    /// ALL data needed for execution is in the event — react() never reads storage.
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

    /// @dev Correct callbackOnly: checks the RN Callback Proxy, not address(this).
    modifier callbackOnly() {
        require(msg.sender == RN_CALLBACK_PROXY, "Callback proxy only");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param _owner            Admin address.
     * @param _initialChainIds  Chain IDs (e.g. [8453, 1, 146, 56] for Base, ETH, Sonic, BNB).
     * @param _initialContracts WalletSwapCallback addresses on each chain.
     */
    constructor(
        address _owner,
        uint256[] memory _initialChainIds,
        address[] memory _initialContracts
    ) payable {
        require(_initialChainIds.length == _initialContracts.length, "Length mismatch");
        owner = _owner;

        // Register chains — this state IS visible to react() (constructor snapshot).
        for (uint256 i = 0; i < _initialChainIds.length; i++) {
            uint256 cid = _initialChainIds[i];
            address cc  = _initialContracts[i];
            require(cid != 0 && cc != address(0), "Invalid chain config");

            chains[cid] = ChainConfig({ chainId: cid, walletSwap: cc, active: true });
            chainIds.push(cid);
        }

        if (!vm) {
            // Subscribe to OrderInitiated from each chain's WalletSwapCallback
            for (uint256 i = 0; i < _initialChainIds.length; i++) {
                service.subscribe(
                    _initialChainIds[i],
                    _initialContracts[i],
                    ORDER_INITIATED_TOPIC_0,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE,
                    REACTIVE_IGNORE
                );
            }

            // Subscribe to our own MatchFound events (emitted by persistAndMatch)
            // so react() can dispatch execution callbacks.
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
    //  react() — runs in ReactVM, no state writes, only emit Callback
    // ═══════════════════════════════════════════════════════════════════════

    function react(LogRecord calldata log) external vmOnly {
        if (log.topic_0 == ORDER_INITIATED_TOPIC_0) {
            _onOrderInitiated(log);
        } else if (log.topic_0 == MATCH_FOUND_TOPIC_0 && log._contract == address(this)) {
            _onMatchFound(log);
        }
    }

    /**
     * @dev Handles OrderInitiated from a destination chain.
     *      Decodes the event and emits a self-callback to persistAndMatch().
     */
    function _onOrderInitiated(LogRecord calldata log) internal {
        bytes32 orderId = bytes32(log.topic_1);
        address maker   = address(uint160(uint256(log.topic_2)));

        // Decode non-indexed data from the OrderInitiated event.
        // OrderInitiated has 8 non-indexed params: tokenIn, tokenOut, typeIn, typeOut,
        // amountIn, amountOut, targetChainId, timestamp.
        // NOTE: The original SwapMatcherMultiChain tried to decode 9 params (adding expiration)
        // but the event only has 8 — that decode would revert every time.
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

        // Only handle cross-chain orders
        if (targetChainId == 0 || targetChainId == sourceChainId) return;

        // Validate target chain is registered (constructor-state, readable here)
        if (!chains[targetChainId].active) return;

        // Self-callback to persist order and attempt matching
        // First param is address(0) — the sender slot (RN replaces with RVM ID)
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

    /**
     * @dev Handles MatchFound event emitted by persistAndMatch().
     *      Decodes the match details and emits execution callbacks to BOTH chains.
     *      THIS is where execution callbacks are emitted — from react(), not callbackOnly.
     */
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

        // Execution callback to chain A: release order A's locked assets to makerB
        // Signature: executeInterChainOrder(address sender, bytes32 orderId, address beneficiary, uint256 amount)
        bytes memory payloadA = abi.encodeWithSignature(
            "executeInterChainOrder(address,bytes32,address,uint256)",
            address(0),    // sender slot (RN injects RVM ID)
            orderIdA,
            makerB,        // beneficiary — the counterparty receives the assets
            amountInA
        );
        emit Callback(sourceChainA, contractA, CALLBACK_GAS_LIMIT, payloadA);
        emit MatchExecutionSent(orderIdA, sourceChainA, makerB, amountInA);

        // Execution callback to chain B: release order B's locked assets to makerA
        bytes memory payloadB = abi.encodeWithSignature(
            "executeInterChainOrder(address,bytes32,address,uint256)",
            address(0),    // sender slot
            orderIdB,
            makerA,        // beneficiary
            amountInB
        );
        emit Callback(sourceChainB, contractB, CALLBACK_GAS_LIMIT, payloadB);
        emit MatchExecutionSent(orderIdB, sourceChainB, makerA, amountInB);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  callbackOnly — state-persistence functions (run as real EVM on RN)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Persists a cross-chain order and immediately attempts to find a match.
     *         If a match is found, emits MatchFound (which react() picks up to dispatch
     *         execution callbacks). This avoids the nested-callback problem.
     *
     * @dev Called via self-callback from react(). The first `address` param is the
     *      sender slot (RVM ID), injected by the Reactive Network.
     */
    function persistAndMatch(
        address,          // sender slot (RVM ID)
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
        // Validate
        if (!chains[targetChainId].active) return;
        if (orders[orderId].maker != address(0)) return; // duplicate guard

        AssetType typeIn  = AssetType(typeInRaw);
        AssetType typeOut = AssetType(typeOutRaw);

        // Store order
        orders[orderId] = CrossChainOrder({
            orderId:       orderId,
            maker:         maker,
            tokenIn:       tokenIn,
            tokenOut:      tokenOut,
            typeIn:        typeIn,
            typeOut:        typeOut,
            amountIn:      amountIn,
            amountOut:     amountOut,
            targetChainId: targetChainId,
            sourceChainId: sourceChainId,
            timestamp:     timestamp,
            expiration:    0, // Expiration managed locally by each chain's order processor
            status:        OrderStatus.Active
        });

        // Index for matching: orders on targetChain wanting (tokenOut→tokenIn)
        ordersByPair[targetChainId][tokenOut][tokenIn].push(orderId);

        emit OrderReceived(orderId, sourceChainId, targetChainId, maker);

        // ── Attempt to find a match ──────────────────────────────────────
        // Look for existing orders on the opposite side:
        // We want orders whose sourceChain == our targetChain, and whose
        // tokenIn == our tokenOut (they offer what we want).
        bytes32[] storage candidates = ordersByPair[sourceChainId][tokenIn][tokenOut];

        for (uint256 i = 0; i < candidates.length; i++) {
            bytes32 candidateId = candidates[i];
            if (candidateId == orderId) continue; // don't match self

            CrossChainOrder storage c = orders[candidateId];

            if (c.status != OrderStatus.Active) continue;
            if (c.sourceChainId != targetChainId) continue;
            if (c.targetChainId != sourceChainId) continue;
            if (c.tokenIn != tokenOut || c.tokenOut != tokenIn) continue;
            if (c.typeIn != typeOut   || c.typeOut != typeIn)   continue;

            if (!_checkAmountCompatibility(typeOut, amountOut, c.amountIn, typeIn, amountIn, c.amountOut)) {
                continue;
            }

            // ── Match found! ─────────────────────────────────────────────
            orders[orderId].status = OrderStatus.Matched;
            c.status = OrderStatus.Matched;

            // Emit MatchFound with ALL data react() needs to dispatch execution callbacks.
            // react() cannot read storage, so everything must be in the event.
            emit MatchFound(
                orderId,
                candidateId,
                maker,
                c.maker,
                amountIn,
                c.amountIn,
                sourceChainId,
                c.sourceChainId,
                chains[sourceChainId].walletSwap,      // CC address on chain A
                chains[c.sourceChainId].walletSwap      // CC address on chain B
            );

            return; // one match per order
        }
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
    //  Admin — chain management
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Add a new chain. Subscribes to its OrderInitiated events.
     * @dev Note: react() will NOT see chains added after deployment (ReactVM constraint).
     *      However, subscriptions DO take effect — new OrderInitiated events will trigger react().
     *      The chain config in storage is used by persistAndMatch() (callbackOnly, real EVM).
     *      For react() to read the walletSwap address when emitting MatchFound, chains must
     *      be registered at constructor time. Post-constructor chains work for order storage
     *      and matching, but MatchFound will include address(0) for the walletSwap.
     *      To add chains that work end-to-end, redeploy the RC.
     */
    function addChain(uint256 chainId, address walletSwap) external rnOnly onlyOwner {
        require(chainId != 0 && walletSwap != address(0), "Invalid");
        require(!chains[chainId].active, "Already registered");

        chains[chainId] = ChainConfig({ chainId: chainId, walletSwap: walletSwap, active: true });
        chainIds.push(chainId);

        service.subscribe(
            chainId,
            walletSwap,
            ORDER_INITIATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );

        emit ChainAdded(chainId, walletSwap);
    }

    function removeChain(uint256 chainId) external rnOnly onlyOwner {
        ChainConfig storage cfg = chains[chainId];
        require(cfg.active, "Not registered");

        service.unsubscribe(
            chainId,
            cfg.walletSwap,
            ORDER_INITIATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );

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

    // ═══════════════════════════════════════════════════════════════════════
    //  View functions
    // ═══════════════════════════════════════════════════════════════════════

    function getOrder(bytes32 orderId) external view returns (CrossChainOrder memory) {
        return orders[orderId];
    }

    function getRegisteredChains() external view returns (uint256[] memory) {
        return chainIds;
    }

    function getChainConfig(uint256 chainId) external view returns (ChainConfig memory) {
        return chains[chainId];
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Admin — emergency & funds
    // ═══════════════════════════════════════════════════════════════════════

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

    function transferOwnership(address newOwner) external rnOnly onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Pausable subscriptions
    // ═══════════════════════════════════════════════════════════════════════

    function getPausableSubscriptions()
        internal
        view
        override
        returns (Subscription[] memory)
    {
        // Return all active chain subscriptions + the MatchFound self-subscription
        uint256 count = chainIds.length + 1; // +1 for MatchFound
        Subscription[] memory subs = new Subscription[](count);

        for (uint256 i = 0; i < chainIds.length; i++) {
            ChainConfig storage cfg = chains[chainIds[i]];
            subs[i] = Subscription({
                chain_id:  cfg.chainId,
                _contract: cfg.walletSwap,
                topic_0:   ORDER_INITIATED_TOPIC_0,
                topic_1:   REACTIVE_IGNORE,
                topic_2:   REACTIVE_IGNORE,
                topic_3:   REACTIVE_IGNORE
            });
        }

        // MatchFound self-subscription
        subs[chainIds.length] = Subscription({
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
