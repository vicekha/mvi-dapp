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



contract WalletSwapMain is Ownable, ReentrancyGuard, AbstractCallback {
    VirtualLiquidityPool public liquidityPool;
    EulerLagrangeOrderProcessor public orderProcessor;
    TrustWalletFeeDistributor public feeDistributor;
    AssetVerifier public assetVerifier;

    enum AssetType { ERC20, ERC721 }
    
    using SafeERC20 for IERC20;

    address public constant SYSTEM_CONTRACT = address(uint160(0xFFFFFF));
    address public callbackProxy; // Keep for ABI compatibility and management

    // C-5: Pull-pattern for ETH refunds
    mapping(address => uint256) public pendingWithdrawals;

    // Spam Prevention: Address Blocklist
    mapping(address => bool) public isBlacklisted;



    event MatchCalculated(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 amountAtoB, uint256 amountBtoA);
    uint256 public constant MIN_GAS_FEE = 0.002 ether;
    event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, AssetType typeIn, AssetType typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp);
    event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp);
    event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp);
    event CrossChainCallbackExecuted(bytes32 indexed callbackId, bytes32 indexed orderId, uint256 amountOut, uint256 timestamp);
    event InterChainOwnershipExchanged(bytes32 indexed orderId, address indexed maker, address indexed beneficiary, address tokenIn, uint256 amount);
    event WalletSwapMainInitialized(address indexed owner);
    
    constructor(address _pool, address _proc, address _fee, address _asset, address _callbackProxy) 
        AbstractCallback(_callbackProxy) 
    {
        liquidityPool = VirtualLiquidityPool(_pool);
        orderProcessor = EulerLagrangeOrderProcessor(_proc);
        feeDistributor = TrustWalletFeeDistributor(payable(_fee));
        assetVerifier = AssetVerifier(_asset);
        callbackProxy = _callbackProxy;
        emit WalletSwapMainInitialized(msg.sender);
    }

    function createOrder(
        address tokenIn, address tokenOut, AssetType typeIn, AssetType typeOut,
        uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut,
        uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId
    ) external payable nonReentrant returns (bytes32) {
        require(!isBlacklisted[msg.sender], "Address blacklisted");
        uint256 fee = feeDistributor.calculateFee(tokenIn, TrustWalletFeeDistributor.AssetType(uint8(typeIn)), amountIn, minutesValueIn);

        require(amountIn > 0, "Invalid amount");
        
        // Enforce Minimum Gas Fee for Debt Coverage
        if (tokenIn == address(0)) {
            require(msg.value >= amountIn + fee + MIN_GAS_FEE, "Insufficient native sent (Amount + Fee + Gas)");
        } else {
             require(msg.value >= MIN_GAS_FEE, "Insufficient gas fee sent");
        }

        // Forward Gas Fee to Distributor
        feeDistributor.depositGasForDebt{value: MIN_GAS_FEE}(bytes32(0));

        if (typeIn == AssetType.ERC20 && tokenIn != address(0)) {
            // ERC20: Pull fee from user to this contract first
            // This allows user to ONLY approve WalletSwapMain, not FeeDistributor
            if (fee > 0) {
                IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), fee);
                // Safe approval pattern: reset to 0 then set value
                IERC20(tokenIn).safeApprove(address(feeDistributor), 0);
                IERC20(tokenIn).safeApprove(address(feeDistributor), fee);
            }
        } else if (typeIn == AssetType.ERC721) {
            require(msg.value >= fee, "Insufficient fee for NFT");
        }
        
        // Distribute fee
        // FIXED: Only pass msg.value (fee) if it's Native or NFT. For ERC20, pass 0 value (tokens are transferred via safeTransferFrom).
        uint256 valueToSend = 0;
        if (tokenIn == address(0) || typeIn == AssetType.ERC721) {
            valueToSend = fee;
        }

        feeDistributor.distributeFee{value: valueToSend}(
             tokenIn, TrustWalletFeeDistributor.AssetType(uint8(typeIn)), amountIn, minutesValueIn, 
             tokenIn == address(0) || uint8(typeIn) == uint8(AssetType.ERC721) ? msg.sender : address(this), // Sender is THIS contract for ERC20s
             keccak256(abi.encodePacked(msg.sender, block.timestamp))
        );
        
        bytes32 orderId = orderProcessor.createOrder(
            msg.sender, tokenIn, tokenOut, EulerLagrangeOrderProcessor.AssetType(uint8(typeIn)), EulerLagrangeOrderProcessor.AssetType(uint8(typeOut)),
            amountIn, amountOut, minutesValueIn, minutesValueOut, slippageTolerance, block.timestamp + duration, enableRebooking, targetChainId
        );
        
        emit OrderInitiated(orderId, msg.sender, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, targetChainId, block.timestamp);
        
        // AUTOMATIC INSTANT MATCHING: MARKET SWEEP
        // Only attempt local matching if the order is intended for THIS chain
        if (targetChainId == 0 || targetChainId == block.chainid) {
            emit MatchAttempted(orderId, tokenIn, tokenOut);
            
            uint256 matchAttempts = 0;
            uint256 MAX_MATCH_ITERATIONS = 20; // Cap to prevent gas limit issues

            while (matchAttempts < MAX_MATCH_ITERATIONS) {
                 // Refresh order state to get current filled amount
                 EulerLagrangeOrderProcessor.Order memory currentOrder = orderProcessor.getOrder(orderId);
                 
                 // If fully filled, stop
                 if (currentOrder.status == EulerLagrangeOrderProcessor.OrderStatus.FILLED) {
                     break;
                 }
                 
                 // Calculate remaining amounts to match
                 uint256 remainingIn = currentOrder.amountIn;
                 uint256 remainingOut = currentOrder.amountOut;
                 
                 if (currentOrder.filledAmount > 0) {
                     remainingOut = currentOrder.amountOut - currentOrder.filledAmount;
                     // Re-calculate remaining input based on original ratio to avoid drift, though linear is fine here
                     remainingIn = (remainingOut * currentOrder.amountIn) / currentOrder.amountOut;
                 }

                 // Find a match for the REMAINING amount
                 bytes32 matchOrderId = orderProcessor.findMatchingOrder(tokenIn, tokenOut, remainingIn, remainingOut);
                 
                 if (matchOrderId == bytes32(0)) {
                     break; // No more matches available
                 }

                 EulerLagrangeOrderProcessor.Order memory matchOrder = orderProcessor.getOrder(matchOrderId);
                 
                 // Check Solvency for ERC20 Orders (JIT Liquidity)
                 if (matchOrder.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20 && matchOrder.tokenIn != address(0)) {
                     bool isSolvent = false;
                     uint256 needed = matchOrder.amountIn;
                     if (matchOrder.filledAmount > 0) {
                          needed = matchOrder.amountIn - matchOrder.filledAmount;
                     }
                     
                     try IERC20(matchOrder.tokenIn).balanceOf(matchOrder.maker) returns (uint256 bal) {
                         if (bal >= needed) {
                             try IERC20(matchOrder.tokenIn).allowance(matchOrder.maker, address(this)) returns (uint256 all) {
                                 if (all >= needed) {
                                     isSolvent = true;
                                 }
                             } catch {}
                         }
                     } catch {}
                     
                     if (!isSolvent) {
                         // Prune stale order
                         orderProcessor.updateOrderStatus(matchOrderId, EulerLagrangeOrderProcessor.OrderStatus.CANCELLED);
                         orderProcessor.removeFromPairIndex(matchOrderId);
                         continue; // Retry loop to find next match
                     }
                 }

                 // Execute instant match
                 _executeMatch(orderId, matchOrderId, currentOrder, matchOrder);
                 emit OrderAutoMatched(orderId, matchOrderId, block.timestamp);
                 
                 matchAttempts++;
            }
        }
        
        return orderId;
    }

    event MatchAttempted(bytes32 indexed orderId, address tokenIn, address tokenOut);

    function _executeMatch(
        bytes32 orderIdA,
        bytes32 orderIdB,
        EulerLagrangeOrderProcessor.Order memory orderA,
        EulerLagrangeOrderProcessor.Order memory orderB
    ) private {
        // Symmetry: Both orders could be partially filled
        uint256 remainingBWant = orderB.amountOut - orderB.filledAmount;
        uint256 remainingBGive = (remainingBWant * orderB.amountIn) / orderB.amountOut;

        uint256 remainingAWant = orderA.amountOut - orderA.filledAmount;
        uint256 remainingAGive = (remainingAWant * orderA.amountIn) / orderA.amountOut;
        
        // Match calculation:
        // We need to find the maximum amount that satisfies ALL constraints:
        // 1. A Gives <= remainingAGive
        // 2. A Takes <= remainingAWant
        // 3. B Gives <= remainingBGive
        // 4. B Takes <= remainingBWant
        
        uint256 amountAtoB;
        uint256 amountBtoA;

        // We calculate the proposed trade based on B's capacity first (since B is likely smaller in a sweep)
        // 1. Constraint: B's Want (B receives max remainingBWant)
        uint256 tradeAmountAtoB_byBWant = remainingBWant;
        uint256 tradeAmountBtoA_byBWant = (tradeAmountAtoB_byBWant * orderB.amountIn) / orderB.amountOut;

        // 2. Constraint: B's Give (B gives max remainingBGive)
        uint256 tradeAmountBtoA_byBGive = remainingBGive;
        uint256 tradeAmountAtoB_byBGive = (tradeAmountBtoA_byBGive * orderB.amountOut) / orderB.amountIn;
        
        // Take the min of B's possibilities (Rate check essentially)
        // Usually these are consistent if rate matches, but we pick the tighter one to be safe
        if (tradeAmountAtoB_byBGive < tradeAmountAtoB_byBWant) {
            amountAtoB = tradeAmountAtoB_byBGive;
            amountBtoA = tradeAmountBtoA_byBGive;
        } else {
            amountAtoB = tradeAmountAtoB_byBWant;
            amountBtoA = tradeAmountBtoA_byBWant;
        }

        // 3. Apply A's constraints
        // Constraint: A Gives <= remainingAGive
        if (amountAtoB > remainingAGive) {
            amountAtoB = remainingAGive;
            amountBtoA = (amountAtoB * orderB.amountIn) / orderB.amountOut;
        }

        // Constraint: A Takes <= remainingAWant
        // Note: We use orderA's rate for this check to ensure we don't violate A's price
        if (amountBtoA > remainingAWant) {
             amountBtoA = remainingAWant;
             // Recalculate A -> B based on A's rate? 
             // Logic: A wants exactly amountBtoA. A is willing to give (amountBtoA * A_In / A_Out).
             // But we must also respect B's rate.
             // If we reduce amountBtoA, we must reduce amountAtoB by B's rate to keep B happy.
             amountAtoB = (amountBtoA * orderB.amountOut) / orderB.amountIn;
        }
        
        // Final sanity checks on amounts
        if (amountAtoB > remainingAGive) amountAtoB = remainingAGive; // Floating point drift protection
        if (amountBtoA > remainingBGive) amountBtoA = remainingBGive;
        
        require(amountAtoB > 0, "Zero trade amount (A->B)");
        require(amountBtoA > 0, "Zero trade amount (B->A)");

        emit MatchCalculated(orderIdA, orderIdB, amountAtoB, amountBtoA);

        // M-8: Enforce slippage tolerance
        // Check that the effective rate doesn't deviate beyond either party's tolerance
        if (orderA.slippageTolerance > 0) {
            // Effective rate for A: amountBtoA / amountAtoB compared to orderA.amountOut / orderA.amountIn
            // Cross-multiply: amountBtoA * orderA.amountIn >= orderA.amountOut * amountAtoB * (10000 - slippage) / 10000
            uint256 minAcceptableA = (orderA.amountOut * amountAtoB * (10000 - orderA.slippageTolerance)) / (orderA.amountIn * 10000);
            require(amountBtoA >= minAcceptableA, "Slippage exceeded for order A");
        }
        if (orderB.slippageTolerance > 0) {
            uint256 minAcceptableB = (orderB.amountOut * amountBtoA * (10000 - orderB.slippageTolerance)) / (orderB.amountIn * 10000);
            require(amountAtoB >= minAcceptableB, "Slippage exceeded for order B");
        }

        // C-3/H-5: Transfer B's provide (amountBtoA) FROM B TO A — with try/catch for resilience
        bool transferBtoASuccess = true;
        if (orderA.tokenOut == address(0)) {
            (bool success,) = orderA.maker.call{value: amountBtoA}("");
            transferBtoASuccess = success;
        } else if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            try IERC20(orderA.tokenOut).transferFrom(orderB.maker, orderA.maker, amountBtoA) returns (bool success) {
                transferBtoASuccess = success;
            } catch {
                transferBtoASuccess = false;
            }
        } else {
            try IERC721(orderA.tokenOut).transferFrom(orderB.maker, orderA.maker, amountBtoA) {
                // success
            } catch {
                transferBtoASuccess = false;
            }
        }

        // If B->A transfer failed, cancel the insolvent order (B) and revert the match
        if (!transferBtoASuccess) {
            orderProcessor.updateOrderStatus(orderIdB, EulerLagrangeOrderProcessor.OrderStatus.CANCELLED);
            orderProcessor.removeFromPairIndex(orderIdB);
            return; // Exit without executing A->B
        }

        // Transfer A's provide (amountAtoB) FROM A TO B
        bool transferAtoBSuccess = true;
        if (orderB.tokenOut == address(0)) {
            (bool success,) = orderB.maker.call{value: amountAtoB}("");
            transferAtoBSuccess = success;
        } else if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            try IERC20(orderB.tokenOut).transferFrom(orderA.maker, orderB.maker, amountAtoB) returns (bool success) {
                transferAtoBSuccess = success;
            } catch {
                transferAtoBSuccess = false;
            }
        } else {
            try IERC721(orderB.tokenOut).transferFrom(orderA.maker, orderB.maker, amountAtoB) {
                // success
            } catch {
                transferAtoBSuccess = false;
            }
        }

        // If A->B failed, we need to reverse the B->A transfer (best-effort) and cancel A
        if (!transferAtoBSuccess) {
            // C-5: Credit B's pending withdrawal since we can't reliably reverse the transfer
            // In practice, B already received tokens. We cancel A's order.
            orderProcessor.updateOrderStatus(orderIdA, EulerLagrangeOrderProcessor.OrderStatus.CANCELLED);
            orderProcessor.removeFromPairIndex(orderIdA);
            return;
        }

        // Update Order A status - check if fully or partially filled
        if (amountBtoA >= orderA.amountOut) {
            // A is fully filled
            orderProcessor.updateOrderStatus(orderIdA, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
            orderProcessor.removeFromPairIndex(orderIdA);
        } else {
            // A is only partially filled - update fill amount (A stays in pool for future matches)
            orderProcessor.updateOrderFill(orderIdA, amountBtoA);
        }
        
        // Update Order B status - check if fully or partially filled
        if (orderB.filledAmount + amountAtoB >= orderB.amountOut) {
            // B is now completely filled
            orderProcessor.updateOrderStatus(orderIdB, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
            orderProcessor.removeFromPairIndex(orderIdB);
        } else {
            // B is partially filled - update fill amount
            orderProcessor.updateOrderFill(orderIdB, amountAtoB);
            // Note: orderB stays in matching pool for future matches
        }

        emit OrderExecuted(orderIdA, orderB.maker, amountBtoA, block.timestamp);
        emit OrderExecuted(orderIdB, orderA.maker, amountAtoB, block.timestamp);
    }

    function fulfillOrder(bytes32 orderId) external payable nonReentrant {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Not Active");
        require(block.timestamp <= order.expiration, "Expired");

        if (order.tokenOut == address(0)) {
            require(msg.value >= order.amountOut, "Insufficient native sent");
            (bool success,) = order.maker.call{value: order.amountOut}("");
            require(success, "Maker payment failed");
        } else if (uint256(order.typeOut) == uint256(AssetType.ERC721)) {
            IERC721(order.tokenOut).transferFrom(msg.sender, order.maker, order.amountOut);
        } else {
            bool success = IERC20(order.tokenOut).transferFrom(msg.sender, order.maker, order.amountOut);
            require(success, "Maker payment failed (ERC20)");
        }

        if (order.tokenIn == address(0)) {
            (bool success,) = msg.sender.call{value: order.amountIn}("");
            require(success, "Taker payment failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            IERC721(order.tokenIn).transferFrom(order.maker, msg.sender, order.amountIn);
        } else {
            bool success = IERC20(order.tokenIn).transferFrom(order.maker, msg.sender, order.amountIn);
            require(success, "Taker payment failed (ERC20)");
        }
        orderProcessor.updateOrderStatus(orderId, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
        emit OrderExecuted(orderId, msg.sender, order.amountOut, block.timestamp);
    }

    // Manual order matching for instant swaps
    function matchOrders(bytes32 orderIdA, bytes32 orderIdB) external nonReentrant {
        EulerLagrangeOrderProcessor.Order memory orderA = orderProcessor.getOrder(orderIdA);
        EulerLagrangeOrderProcessor.Order memory orderB = orderProcessor.getOrder(orderIdB);

        // Validate both orders are active
        require(orderA.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Order A not active");
        require(orderB.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Order B not active");

        // Validate orders are compatible (A wants what B offers, B wants what A offers)
        require(orderA.tokenOut == orderB.tokenIn, "Token mismatch");
        require(orderA.tokenIn == orderB.tokenOut, "Token mismatch");
        require(orderA.typeOut == orderB.typeIn, "Type mismatch");
        require(orderA.typeIn == orderB.typeOut, "Type mismatch");

        // Validate amounts are compatible (accounting for slippage)
        if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC721 && orderB.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC721) {
            require(orderA.amountOut == orderB.amountIn, "NFT amount mismatch");
        } else if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20 && orderB.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            uint256 minRequiredByA = (orderA.amountOut * (10000 - orderA.slippageTolerance)) / 10000;
            require(orderB.amountIn >= minRequiredByA, "Amount mismatch (A)");
        }

        if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC721 && orderA.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC721) {
            require(orderB.amountOut == orderA.amountIn, "NFT amount mismatch");
        } else if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20 && orderA.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            uint256 minRequiredByB = (orderB.amountOut * (10000 - orderB.slippageTolerance)) / 10000;
            require(orderA.amountIn >= minRequiredByB, "Amount mismatch (B)");
        }

        // Execute the swap: A's maker gets B's tokenOut, B's maker gets A's tokenOut
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
        require(amountToFill > 0, "Invalid fill amount");
        // Ensure we don't overfill
        require(amountToFill + order.filledAmount <= order.amountOut, "Overfill");

        // Calculate proportional amountIn
        // amountToFill is the portion of amountOut (what Taker provides)
        // amountRecv is the portion of amountIn (what Taker receives)
        uint256 amountRecv = (amountToFill * order.amountIn) / order.amountOut;
        require(amountRecv > 0, "Fill too small");

        // Transfers
        // Taker pays amountToFill (TokenOut)
        if (order.tokenOut == address(0)) {
            require(msg.value >= amountToFill, "Insufficient native sent");
            (bool success,) = order.maker.call{value: amountToFill}("");
            require(success, "Maker payment failed");
            // Refund excess if any
            if (msg.value > amountToFill) {
                (bool refundParams,) = msg.sender.call{value: msg.value - amountToFill}("");
                require(refundParams, "Refund failed");
            }
        } else if (uint256(order.typeOut) == uint256(AssetType.ERC721)) {
            revert("NFT partial fill not supported");
        } else {
            bool success = IERC20(order.tokenOut).transferFrom(msg.sender, order.maker, amountToFill);
            require(success, "Maker payment failed (ERC20)");
        }

        // Maker pays amountRecv (TokenIn)
        if (order.tokenIn == address(0)) {
            (bool success,) = msg.sender.call{value: amountRecv}("");
            require(success, "Taker payment failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
             revert("NFT partial fill not supported");
        } else {
            bool success = IERC20(order.tokenIn).transferFrom(order.maker, msg.sender, amountRecv);
            require(success, "Taker payment failed (ERC20)");
        }

        orderProcessor.updateOrderFill(orderId, amountToFill);
        emit OrderExecuted(orderId, msg.sender, amountToFill, block.timestamp);
    }

    // RSC callback function for cross-chain order execution (with partial fill support)
    function executeInterChainOrder(address /* sender */, address rvmId, bytes32 orderId, address beneficiary, uint256 amount) 
        external nonReentrant authorizedSenderOnly rvmIdOnly(rvmId) 
    {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE || order.status == EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED, "Not Active");
        require(block.timestamp <= order.expiration, "Expired");
        require(beneficiary != address(0), "Invalid beneficiary");
        
        // Correct unit-aware capacity check:
        // filledAmount is in units of amountOut.
        // We need to compare amount against the proportional remaining of amountIn.
        uint256 remainingGive = order.amountIn - (order.filledAmount * order.amountIn / order.amountOut);
        require(amount > 0 && amount <= remainingGive, "Invalid amount (Exceeds capacity)");
        
        if (order.tokenIn == address(0)) {
            (bool s,) = beneficiary.call{value: amount}("");
            require(s, "ETH match failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            // NFTs cannot be partially filled, transfer entire tokenId
            require(amount == order.amountIn, "NFT must be full fill");
            IERC721(order.tokenIn).transferFrom(order.maker, beneficiary, order.amountIn);
        } else {
             bool s = IERC20(order.tokenIn).transferFrom(order.maker, beneficiary, amount);
             require(s, "ERC20 match failed");
        }
        
        // Calculate equivalent amountOut for this partial fill
        uint256 fillAmountOut = (amount * order.amountOut) / order.amountIn;
        orderProcessor.updateOrderFill(orderId, fillAmountOut);
        
        emit InterChainOwnershipExchanged(orderId, order.maker, beneficiary, order.tokenIn, amount);
        emit OrderExecuted(orderId, beneficiary, amount, block.timestamp);
    }



    function cancelOrder(bytes32 orderId) external nonReentrant {
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(order.maker == msg.sender, "Unauthorized");
        
        // Remove from pair index before cancellation
        orderProcessor.removeFromPairIndex(orderId);
        orderProcessor.cancelOrder(orderId);
        
        // Only native tokens are held by contract - refund them
        // ERC20 and NFTs remain in user wallet with approval, no transfer needed
        if (order.tokenIn == address(0)) {
            uint256 refund = _calculateRefundAmount(order);
            if (refund > 0) {
                // Return funds directly to user (Automatic Refund)
                (bool success,) = msg.sender.call{value: refund}("");
                require(success, "Automatic refund failed");
            }
        }
        // Note: ERC20/NFT tokens never left the user's wallet - they just approved them
        // The approval remains but the order is cancelled, so no transfer happens
    }

    /**
     * @dev DEPRECATED C-5: Withdraw pending ETH refunds
     * Left for ABI compatibility and to allow any users with existing pending balances to withdraw.
     */
    function withdrawRefund() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No pending refund");
        pendingWithdrawals[msg.sender] = 0;
        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Withdrawal failed");
    }

    function processExpiredOrderRefund(bytes32 orderId) external nonReentrant {
        require(msg.sender == address(orderProcessor) || senders[msg.sender], "Unauthorized");
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        if (order.tokenIn == address(0)) {
             uint256 refund = _calculateRefundAmount(order);
             if (refund > 0) {
                 // Return funds directly to user
                 (bool success,) = order.maker.call{value: refund}("");
                 require(success, "Automatic refund failed on expire");
             }
        }
    }

    function _calculateRefundAmount(EulerLagrangeOrderProcessor.Order memory order) internal pure returns (uint256) {
        if (order.filledAmount == 0) return order.amountIn;
        uint256 obligated = (order.filledAmount * order.amountIn) / order.amountOut;
        return order.amountIn > obligated ? order.amountIn - obligated : 0;
    }

    function _attemptDebtCoverage() internal {
        (bool success, bytes memory data) = SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", address(this)));
        if (success && data.length > 0) {
             uint256 debt = abi.decode(data, (uint256));
             if (debt > 0 && feeDistributor.accumulatedFees(address(0)) >= debt) {
                 feeDistributor.coverReactiveDebt(address(this));
             }
        }
    }

    function setAuthorizedReactiveVM(address _rvm) external onlyOwner {
        rvm_id = _rvm;
    }

    /**
     * @dev Handle cross-chain swap intent from the bridge
     */
    // C-1: Restricted to authorized callers only
    function handleCrossChainIntent(
        bytes32 orderId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address maker,
        uint256 sourceChainId
    ) external authorizedSenderOnly {
        emit MatchAttempted(orderId, tokenIn, tokenOut);
    }

    function setCallbackProxy(address _proxy) external onlyOwner {
        removeAuthorizedSender(callbackProxy);
        callbackProxy = _proxy;
        vendor = IPayable(payable(_proxy));
        addAuthorizedSender(_proxy);
    }

    /**
     * @dev Management function for the blocklist.
     * Restricted to contract owner or the authorized Reactive Network components.
     */
    function setBlacklist(address account, bool status) external {
        require(msg.sender == owner() || senders[msg.sender], "Unauthorized");
        isBlacklisted[account] = status;
    }





    function updateComponents(address _lp, address _proc, address _fee, address _av) external onlyOwner {
        if (_lp != address(0)) liquidityPool = VirtualLiquidityPool(_lp);
        if (_proc != address(0)) orderProcessor = EulerLagrangeOrderProcessor(_proc);
        if (_fee != address(0)) feeDistributor = TrustWalletFeeDistributor(payable(_fee));
        if (_av != address(0)) assetVerifier = AssetVerifier(_av);
    }
    
    function estimateTokenMinutesValue(address, uint256 amount) public pure returns (uint256) { return amount; }

    // L-5: Allow owner to withdraw stuck/untracked ETH
    function withdrawStuckETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success,) = payable(owner()).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    function registerForDebtCoverage() external onlyOwner { feeDistributor.registerReactiveContract(address(this)); }
    function manualCoverDebt() external onlyOwner { _attemptDebtCoverage(); }
    function getDebtStatus() external view returns (uint256 debt, uint256 reactFees, bool can) {
        (bool s, bytes memory d) = SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", address(this)));
        if (s && d.length > 0) debt = abi.decode(d, (uint256));
        reactFees = feeDistributor.accumulatedFees(address(0));
        can = reactFees >= debt && debt > 0;
    }
    receive() external payable override {}
}
