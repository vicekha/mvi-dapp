// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {VirtualLiquidityPool} from "./VirtualLiquidityPool.sol";
import {EulerLagrangeOrderProcessor} from "./EulerLagrangeOrderProcessor.sol";
import {TrustWalletFeeDistributor} from "./TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "./AssetVerifier.sol";
import "reactive-lib/abstract-base/AbstractCallback.sol";

/**
 * @title WalletSwapCallback
 * @notice Callback Contract (CC) for cross-chain order matching via Reactive Network.
 *
 * Fixes over the original WalletSwapMain:
 *
 *   1. executeInterChainOrder: Simplified to 4 params with correct sender slot.
 *      Old: (address sender, address rvmId, bytes32, address, uint256) — required
 *      passing rvmId redundantly. New: (address sender, bytes32, address, uint256).
 *      The sender IS the RVM ID (injected by RN). rvmIdOnly validates it.
 *
 *   2. processExpiredOrderRefund: Added mandatory `address sender` first param.
 *      Old signature had NO sender slot — the RN would inject the RVM ID into the
 *      orderId parameter, corrupting it. Now correctly separated.
 *
 *   3. setBlacklist: Added mandatory `address sender` first param.
 *      Old signature was (address account, bool status) — the RN would replace
 *      `account` with the RVM ID, blacklisting the wrong address.
 *
 * Callback Proxy addresses (pass as _callbackProxy in constructor):
 *   - Ethereum Mainnet: 0x1D5267C1bb7D8bA68964dDF3990601BDB7902D76
 *   - Base Mainnet:     0x0D3E76De6bC44309083cAAFdB49A088B8a250947
 *   - BSC Mainnet:      0xdb81A196A0dF9Ef974C9430495a09B6d535fAc48
 *   - Sonic Mainnet:    0x9299472A6399Fd1027ebF067571Eb3e3D7837FC4
 */
contract WalletSwapCallback is Ownable, ReentrancyGuard, AbstractCallback {
    using SafeERC20 for IERC20;

    VirtualLiquidityPool public liquidityPool;
    EulerLagrangeOrderProcessor public orderProcessor;
    TrustWalletFeeDistributor public feeDistributor;
    AssetVerifier public assetVerifier;

    enum AssetType { ERC20, ERC721 }

    // ═══════════════════════════════════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════════════════════════════════

    uint256 public constant MIN_GAS_FEE = 0.002 ether;

    /// @notice Pull-pattern for ETH refunds
    mapping(address => uint256) public pendingWithdrawals;

    /// @notice Spam prevention blocklist (managed by RC via callback)
    mapping(address => bool) public isBlacklisted;

    // ═══════════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════════

    event OrderInitiated(
        bytes32 indexed orderId,
        address indexed maker,
        address tokenIn,
        address tokenOut,
        AssetType typeIn,
        AssetType typeOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 targetChainId,
        uint256 timestamp
    );
    event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp);
    event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp);
    event MatchCalculated(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 amountAtoB, uint256 amountBtoA);
    event CrossChainCallbackExecuted(bytes32 indexed orderId, address indexed beneficiary, uint256 amount, uint256 timestamp);
    event InterChainOwnershipExchanged(bytes32 indexed orderId, address indexed maker, address indexed beneficiary, address tokenIn, uint256 amount);
    event MatchAttempted(bytes32 indexed orderId, address tokenIn, address tokenOut);
    event WalletSwapCallbackInitialized(address indexed owner);

    // ═══════════════════════════════════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @param _pool           VirtualLiquidityPool address
     * @param _proc           EulerLagrangeOrderProcessor address
     * @param _fee            TrustWalletFeeDistributor address
     * @param _asset          AssetVerifier address
     * @param _callbackProxy  Callback Proxy address for THIS chain (see table above)
     */
    constructor(
        address _pool,
        address _proc,
        address _fee,
        address _asset,
        address _callbackProxy
    ) AbstractCallback(_callbackProxy) {
        liquidityPool  = VirtualLiquidityPool(_pool);
        orderProcessor = EulerLagrangeOrderProcessor(_proc);
        feeDistributor = TrustWalletFeeDistributor(payable(_fee));
        assetVerifier  = AssetVerifier(_asset);
        emit WalletSwapCallbackInitialized(msg.sender);
    }

    /**
     * @notice Set the authorized RVM ID for callbacks.
     */
    function setCallbackProxy(address _proxy) external onlyOwner {
        vendor = IPayable(payable(_proxy));
        addAuthorizedSender(_proxy);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Order Creation (user-facing, same chain)
    // ═══════════════════════════════════════════════════════════════════════

    function createOrder(
        address tokenIn, address tokenOut, AssetType typeIn, AssetType typeOut,
        uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut,
        uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId
    ) external payable nonReentrant returns (bytes32) {
        require(!isBlacklisted[msg.sender], "Address blacklisted");
        uint256 fee = feeDistributor.calculateFee(
            tokenIn, TrustWalletFeeDistributor.AssetType(uint8(typeIn)), amountIn, minutesValueIn
        );

        require(amountIn > 0, "Invalid amount");

        // Enforce minimum gas fee
        if (tokenIn == address(0)) {
            require(msg.value >= amountIn + fee + MIN_GAS_FEE, "Insufficient native (Amount+Fee+Gas)");
        } else {
            require(msg.value >= MIN_GAS_FEE, "Insufficient gas fee");
        }

        // Forward gas fee to distributor
        feeDistributor.depositGasForDebt{value: MIN_GAS_FEE}(bytes32(0));

        if (typeIn == AssetType.ERC20 && tokenIn != address(0)) {
            if (fee > 0) {
                IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), fee);
                IERC20(tokenIn).safeApprove(address(feeDistributor), 0);
                IERC20(tokenIn).safeApprove(address(feeDistributor), fee);
            }
        } else if (typeIn == AssetType.ERC721) {
            require(msg.value >= fee, "Insufficient fee for NFT");
        }

        uint256 valueToSend = 0;
        if (tokenIn == address(0) || typeIn == AssetType.ERC721) {
            valueToSend = fee;
        }

        feeDistributor.distributeFee{value: valueToSend}(
            tokenIn, TrustWalletFeeDistributor.AssetType(uint8(typeIn)), amountIn, minutesValueIn,
            tokenIn == address(0) || uint8(typeIn) == uint8(AssetType.ERC721) ? msg.sender : address(this),
            keccak256(abi.encodePacked(msg.sender, block.timestamp))
        );

        bytes32 orderId = orderProcessor.createOrder(
            msg.sender, tokenIn, tokenOut,
            EulerLagrangeOrderProcessor.AssetType(uint8(typeIn)),
            EulerLagrangeOrderProcessor.AssetType(uint8(typeOut)),
            amountIn, amountOut, minutesValueIn, minutesValueOut,
            slippageTolerance, block.timestamp + duration, enableRebooking, targetChainId
        );

        emit OrderInitiated(orderId, msg.sender, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, targetChainId, block.timestamp);

        // Local matching only for same-chain orders
        if (targetChainId == 0 || targetChainId == block.chainid) {
            _attemptLocalMatch(orderId, tokenIn, tokenOut);
        }

        return orderId;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Cross-Chain Callback: Execute Inter-Chain Order
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Called by the Reactive Network when a cross-chain match is found.
     *         Releases the maker's locked assets to the beneficiary (counterparty).
     *
     * @param sender      RVM ID (injected by RN, validated by rvmIdOnly)
     * @param orderId     The matched order on this chain
     * @param beneficiary The counterparty who receives the assets
     * @param amount      Amount of tokenIn to transfer to beneficiary
     *
     * @dev FIX: The original WalletSwapMain had 5 params:
     *      (address sender, address rvmId, bytes32 orderId, address beneficiary, uint256 amount)
     *      This was redundant — `sender` IS the RVM ID. The extra `rvmId` param caused
     *      the RC to need to double-encode addresses. Simplified to 4 params.
     */
    function executeInterChainOrder(
        address sender,
        bytes32 orderId,
        address beneficiary,
        uint256 amount
    ) external nonReentrant authorizedSenderOnly rvmIdOnly(sender) {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(
            order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE ||
            order.status == EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED,
            "Not Active"
        );
        require(block.timestamp <= order.expiration, "Expired");
        require(beneficiary != address(0), "Invalid beneficiary");

        // Capacity check
        uint256 remainingGive = order.amountIn - (order.filledAmount * order.amountIn / order.amountOut);
        require(amount > 0 && amount <= remainingGive, "Invalid amount");

        // Transfer assets to beneficiary
        if (order.tokenIn == address(0)) {
            (bool s,) = beneficiary.call{value: amount}("");
            require(s, "ETH transfer failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            require(amount == order.amountIn, "NFT must be full fill");
            IERC721(order.tokenIn).transferFrom(order.maker, beneficiary, order.amountIn);
        } else {
            bool s = IERC20(order.tokenIn).transferFrom(order.maker, beneficiary, amount);
            require(s, "ERC20 transfer failed");
        }

        // Update fill status
        uint256 fillAmountOut = (amount * order.amountOut) / order.amountIn;
        orderProcessor.updateOrderFill(orderId, fillAmountOut);

        emit InterChainOwnershipExchanged(orderId, order.maker, beneficiary, order.tokenIn, amount);
        emit CrossChainCallbackExecuted(orderId, beneficiary, amount, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Cross-Chain Callback: Expired Order Refund
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Called by the RC to process a refund for an expired cross-chain order.
     *
     * @param sender  RVM ID (sender slot, injected by RN)
     * @param orderId The expired order to refund
     *
     * @dev FIX: Original WalletSwapMain had processExpiredOrderRefund(bytes32 orderId)
     *      with NO sender slot. The RN would inject the RVM ID into the orderId parameter,
     *      corrupting it. Now the sender slot is correctly separated.
     */
    function processExpiredOrderRefund(
        address sender,
        bytes32 orderId
    ) external nonReentrant authorizedSenderOnly rvmIdOnly(sender) {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        if (order.tokenIn == address(0)) {
            uint256 refund = _calculateRefundAmount(order);
            if (refund > 0) {
                (bool success,) = order.maker.call{value: refund}("");
                require(success, "Refund failed");
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Cross-Chain Callback: Blacklist Management
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Called by the RC to blacklist a spammer address.
     *
     * @param sender  RVM ID (sender slot, injected by RN)
     * @param account The address to blacklist/unblacklist
     * @param status  true = blacklisted, false = unblacklisted
     *
     * @dev FIX: Original had setBlacklist(address account, bool status) with NO sender slot.
     *      The RN would replace `account` with the RVM ID, blacklisting the wrong address.
     */
    function setBlacklist(
        address sender,
        address account,
        bool status
    ) external authorizedSenderOnly rvmIdOnly(sender) {
        isBlacklisted[account] = status;
    }

    /**
     * @dev Owner can also manage the blacklist directly (no callback needed).
     */
    function setBlacklistOwner(address account, bool status) external onlyOwner {
        isBlacklisted[account] = status;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Local Order Operations
    // ═══════════════════════════════════════════════════════════════════════

    function fulfillOrder(bytes32 orderId) external payable nonReentrant {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Not Active");
        require(block.timestamp <= order.expiration, "Expired");

        if (order.tokenOut == address(0)) {
            require(msg.value >= order.amountOut, "Insufficient native");
            (bool success,) = order.maker.call{value: order.amountOut}("");
            require(success, "Maker payment failed");
        } else if (uint256(order.typeOut) == uint256(AssetType.ERC721)) {
            IERC721(order.tokenOut).transferFrom(msg.sender, order.maker, order.amountOut);
        } else {
            bool success = IERC20(order.tokenOut).transferFrom(msg.sender, order.maker, order.amountOut);
            require(success, "Maker payment failed");
        }

        if (order.tokenIn == address(0)) {
            (bool success,) = msg.sender.call{value: order.amountIn}("");
            require(success, "Taker payment failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            IERC721(order.tokenIn).transferFrom(order.maker, msg.sender, order.amountIn);
        } else {
            bool success = IERC20(order.tokenIn).transferFrom(order.maker, msg.sender, order.amountIn);
            require(success, "Taker payment failed");
        }
        orderProcessor.updateOrderStatus(orderId, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
        emit OrderExecuted(orderId, msg.sender, order.amountOut, block.timestamp);
    }

    function matchOrders(bytes32 orderIdA, bytes32 orderIdB) external nonReentrant {
        EulerLagrangeOrderProcessor.Order memory orderA = orderProcessor.getOrder(orderIdA);
        EulerLagrangeOrderProcessor.Order memory orderB = orderProcessor.getOrder(orderIdB);

        require(orderA.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Order A not active");
        require(orderB.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Order B not active");
        require(orderA.tokenOut == orderB.tokenIn, "Token mismatch");
        require(orderA.tokenIn == orderB.tokenOut, "Token mismatch");
        require(orderA.typeOut == orderB.typeIn, "Type mismatch");
        require(orderA.typeIn == orderB.typeOut, "Type mismatch");

        if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC721 && orderB.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC721) {
            require(orderA.amountOut == orderB.amountIn, "NFT mismatch");
        } else if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20 && orderB.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            uint256 minA = (orderA.amountOut * (10000 - orderA.slippageTolerance)) / 10000;
            require(orderB.amountIn >= minA, "Amount mismatch");
        }

        if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC721 && orderA.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC721) {
            require(orderB.amountOut == orderA.amountIn, "NFT mismatch");
        } else if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20 && orderA.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            uint256 minB = (orderB.amountOut * (10000 - orderB.slippageTolerance)) / 10000;
            require(orderA.amountIn >= minB, "Amount mismatch");
        }

        _executeMatch(orderIdA, orderIdB, orderA, orderB);
        emit OrderAutoMatched(orderIdA, orderIdB, block.timestamp);
    }

    function fulfillOrderPartial(bytes32 orderId, uint256 amountToFill) external payable nonReentrant {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(
            order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE ||
            order.status == EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED,
            "Not Active"
        );
        require(block.timestamp <= order.expiration, "Expired");
        require(amountToFill > 0, "Invalid fill");
        require(amountToFill + order.filledAmount <= order.amountOut, "Overfill");

        uint256 amountRecv = (amountToFill * order.amountIn) / order.amountOut;
        require(amountRecv > 0, "Fill too small");

        if (order.tokenOut == address(0)) {
            require(msg.value >= amountToFill, "Insufficient native");
            (bool success,) = order.maker.call{value: amountToFill}("");
            require(success, "Maker payment failed");
            if (msg.value > amountToFill) {
                (bool refundOk,) = msg.sender.call{value: msg.value - amountToFill}("");
                require(refundOk, "Refund failed");
            }
        } else if (uint256(order.typeOut) == uint256(AssetType.ERC721)) {
            revert("NFT partial fill not supported");
        } else {
            bool success = IERC20(order.tokenOut).transferFrom(msg.sender, order.maker, amountToFill);
            require(success, "Maker payment failed");
        }

        if (order.tokenIn == address(0)) {
            (bool success,) = msg.sender.call{value: amountRecv}("");
            require(success, "Taker payment failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            revert("NFT partial fill not supported");
        } else {
            bool success = IERC20(order.tokenIn).transferFrom(order.maker, msg.sender, amountRecv);
            require(success, "Taker payment failed");
        }

        orderProcessor.updateOrderFill(orderId, amountToFill);
        emit OrderExecuted(orderId, msg.sender, amountToFill, block.timestamp);
    }

    function cancelOrder(bytes32 orderId) external nonReentrant {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(order.maker == msg.sender, "Unauthorized");

        orderProcessor.removeFromPairIndex(orderId);
        orderProcessor.cancelOrder(orderId);

        if (order.tokenIn == address(0)) {
            uint256 refund = _calculateRefundAmount(order);
            if (refund > 0) {
                (bool success,) = msg.sender.call{value: refund}("");
                require(success, "Refund failed");
            }
        }
    }

    function withdrawRefund() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No pending refund");
        pendingWithdrawals[msg.sender] = 0;
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Withdrawal failed");
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Set the authorized Reactive VM address.
     *         This is the address of the MviSwapReactive contract on the Reactive Network.
     */
    function setAuthorizedReactiveVM(address _rvm) external onlyOwner {
        rvm_id = _rvm;
    }

    function updateComponents(address _lp, address _proc, address _fee, address _av) external onlyOwner {
        if (_lp != address(0)) liquidityPool = VirtualLiquidityPool(_lp);
        if (_proc != address(0)) orderProcessor = EulerLagrangeOrderProcessor(_proc);
        if (_fee != address(0)) feeDistributor = TrustWalletFeeDistributor(payable(_fee));
        if (_av != address(0)) assetVerifier = AssetVerifier(_av);
    }

    function estimateTokenMinutesValue(address, uint256 amount) public pure returns (uint256) { return amount; }

    function withdrawStuckETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient");
        (bool success,) = payable(owner()).call{value: amount}("");
        require(success, "Transfer failed");
    }

    function registerForDebtCoverage() external onlyOwner { feeDistributor.registerReactiveContract(address(this)); }
    function manualCoverDebt() external onlyOwner { _attemptDebtCoverage(); }
    function getDebtStatus() external view returns (uint256 debt, uint256 reactFees, bool can) {
        address SYSTEM_CONTRACT = address(uint160(0xFFFFFF));
        (bool s, bytes memory d) = SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", address(this)));
        if (s && d.length > 0) debt = abi.decode(d, (uint256));
        reactFees = feeDistributor.accumulatedFees(address(0));
        can = reactFees >= debt && debt > 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  Internal
    // ═══════════════════════════════════════════════════════════════════════

    function _calculateRefundAmount(EulerLagrangeOrderProcessor.Order memory order) internal pure returns (uint256) {
        if (order.filledAmount == 0) return order.amountIn;
        uint256 obligated = (order.filledAmount * order.amountIn) / order.amountOut;
        return order.amountIn > obligated ? order.amountIn - obligated : 0;
    }

    function _attemptDebtCoverage() internal {
        address SYSTEM_CONTRACT = address(uint160(0xFFFFFF));
        (bool success, bytes memory data) = SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", address(this)));
        if (success && data.length > 0) {
            uint256 debt = abi.decode(data, (uint256));
            if (debt > 0 && feeDistributor.accumulatedFees(address(0)) >= debt) {
                feeDistributor.coverReactiveDebt(address(this));
            }
        }
    }

    function _attemptLocalMatch(bytes32 orderId, address tokenIn, address tokenOut) internal {
        emit MatchAttempted(orderId, tokenIn, tokenOut);

        uint256 matchAttempts = 0;
        uint256 MAX_MATCH_ITERATIONS = 20;

        while (matchAttempts < MAX_MATCH_ITERATIONS) {
            EulerLagrangeOrderProcessor.Order memory currentOrder = orderProcessor.getOrder(orderId);

            if (currentOrder.status == EulerLagrangeOrderProcessor.OrderStatus.FILLED) break;

            uint256 remainingIn = currentOrder.amountIn;
            uint256 remainingOut = currentOrder.amountOut;

            if (currentOrder.filledAmount > 0) {
                remainingOut = currentOrder.amountOut - currentOrder.filledAmount;
                remainingIn = (remainingOut * currentOrder.amountIn) / currentOrder.amountOut;
            }

            bytes32 matchOrderId = orderProcessor.findMatchingOrder(tokenIn, tokenOut, remainingIn, remainingOut);
            if (matchOrderId == bytes32(0)) break;

            EulerLagrangeOrderProcessor.Order memory matchOrder = orderProcessor.getOrder(matchOrderId);

            // Solvency check for ERC20
            if (matchOrder.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20 && matchOrder.tokenIn != address(0)) {
                bool isSolvent = false;
                uint256 needed = matchOrder.amountIn;
                if (matchOrder.filledAmount > 0) {
                    needed = matchOrder.amountIn - matchOrder.filledAmount;
                }
                try IERC20(matchOrder.tokenIn).balanceOf(matchOrder.maker) returns (uint256 bal) {
                    if (bal >= needed) {
                        try IERC20(matchOrder.tokenIn).allowance(matchOrder.maker, address(this)) returns (uint256 all) {
                            if (all >= needed) isSolvent = true;
                        } catch {}
                    }
                } catch {}

                if (!isSolvent) {
                    orderProcessor.updateOrderStatus(matchOrderId, EulerLagrangeOrderProcessor.OrderStatus.CANCELLED);
                    orderProcessor.removeFromPairIndex(matchOrderId);
                    continue;
                }
            }

            _executeMatch(orderId, matchOrderId, currentOrder, matchOrder);
            emit OrderAutoMatched(orderId, matchOrderId, block.timestamp);
            matchAttempts++;
        }
    }

    function _executeMatch(
        bytes32 orderIdA,
        bytes32 orderIdB,
        EulerLagrangeOrderProcessor.Order memory orderA,
        EulerLagrangeOrderProcessor.Order memory orderB
    ) private {
        uint256 remainingBWant = orderB.amountOut - orderB.filledAmount;
        uint256 remainingBGive = (remainingBWant * orderB.amountIn) / orderB.amountOut;
        uint256 remainingAWant = orderA.amountOut - orderA.filledAmount;
        uint256 remainingAGive = (remainingAWant * orderA.amountIn) / orderA.amountOut;

        uint256 amountAtoB;
        uint256 amountBtoA;

        uint256 tradeAmountAtoB_byBWant = remainingBWant;
        uint256 tradeAmountBtoA_byBWant = (tradeAmountAtoB_byBWant * orderB.amountIn) / orderB.amountOut;
        uint256 tradeAmountBtoA_byBGive = remainingBGive;
        uint256 tradeAmountAtoB_byBGive = (tradeAmountBtoA_byBGive * orderB.amountOut) / orderB.amountIn;

        if (tradeAmountAtoB_byBGive < tradeAmountAtoB_byBWant) {
            amountAtoB = tradeAmountAtoB_byBGive;
            amountBtoA = tradeAmountBtoA_byBGive;
        } else {
            amountAtoB = tradeAmountAtoB_byBWant;
            amountBtoA = tradeAmountBtoA_byBWant;
        }

        if (amountAtoB > remainingAGive) {
            amountAtoB = remainingAGive;
            amountBtoA = (amountAtoB * orderB.amountIn) / orderB.amountOut;
        }

        if (amountBtoA > remainingAWant) {
            amountBtoA = remainingAWant;
            amountAtoB = (amountBtoA * orderB.amountOut) / orderB.amountIn;
        }

        if (amountAtoB > remainingAGive) amountAtoB = remainingAGive;
        if (amountBtoA > remainingBGive) amountBtoA = remainingBGive;

        require(amountAtoB > 0, "Zero trade (A->B)");
        require(amountBtoA > 0, "Zero trade (B->A)");

        emit MatchCalculated(orderIdA, orderIdB, amountAtoB, amountBtoA);

        // Slippage checks
        if (orderA.slippageTolerance > 0) {
            uint256 minA = (orderA.amountOut * amountAtoB * (10000 - orderA.slippageTolerance)) / (orderA.amountIn * 10000);
            require(amountBtoA >= minA, "Slippage exceeded (A)");
        }
        if (orderB.slippageTolerance > 0) {
            uint256 minB = (orderB.amountOut * amountBtoA * (10000 - orderB.slippageTolerance)) / (orderB.amountIn * 10000);
            require(amountAtoB >= minB, "Slippage exceeded (B)");
        }

        // Transfer B→A
        bool transferBtoASuccess = true;
        if (orderA.tokenOut == address(0)) {
            (bool success,) = orderA.maker.call{value: amountBtoA}("");
            transferBtoASuccess = success;
        } else if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            try IERC20(orderA.tokenOut).transferFrom(orderB.maker, orderA.maker, amountBtoA) returns (bool success) {
                transferBtoASuccess = success;
            } catch { transferBtoASuccess = false; }
        } else {
            try IERC721(orderA.tokenOut).transferFrom(orderB.maker, orderA.maker, amountBtoA) {
            } catch { transferBtoASuccess = false; }
        }

        if (!transferBtoASuccess) {
            orderProcessor.updateOrderStatus(orderIdB, EulerLagrangeOrderProcessor.OrderStatus.CANCELLED);
            orderProcessor.removeFromPairIndex(orderIdB);
            return;
        }

        // Transfer A→B
        bool transferAtoBSuccess = true;
        if (orderB.tokenOut == address(0)) {
            (bool success,) = orderB.maker.call{value: amountAtoB}("");
            transferAtoBSuccess = success;
        } else if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            try IERC20(orderB.tokenOut).transferFrom(orderA.maker, orderB.maker, amountAtoB) returns (bool success) {
                transferAtoBSuccess = success;
            } catch { transferAtoBSuccess = false; }
        } else {
            try IERC721(orderB.tokenOut).transferFrom(orderA.maker, orderB.maker, amountAtoB) {
            } catch { transferAtoBSuccess = false; }
        }

        if (!transferAtoBSuccess) {
            orderProcessor.updateOrderStatus(orderIdA, EulerLagrangeOrderProcessor.OrderStatus.CANCELLED);
            orderProcessor.removeFromPairIndex(orderIdA);
            return;
        }

        // Update fill status
        if (amountBtoA >= orderA.amountOut) {
            orderProcessor.updateOrderStatus(orderIdA, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
            orderProcessor.removeFromPairIndex(orderIdA);
        } else {
            orderProcessor.updateOrderFill(orderIdA, amountBtoA);
        }

        if (orderB.filledAmount + amountAtoB >= orderB.amountOut) {
            orderProcessor.updateOrderStatus(orderIdB, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
            orderProcessor.removeFromPairIndex(orderIdB);
        } else {
            orderProcessor.updateOrderFill(orderIdB, amountAtoB);
        }

        emit OrderExecuted(orderIdA, orderB.maker, amountBtoA, block.timestamp);
        emit OrderExecuted(orderIdB, orderA.maker, amountAtoB, block.timestamp);
    }

    receive() external payable override {}
}
