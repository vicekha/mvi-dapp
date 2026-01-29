// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {VirtualLiquidityPool} from "./VirtualLiquidityPool.sol";
import {EulerLagrangeOrderProcessor} from "./EulerLagrangeOrderProcessor.sol";
import {TrustWalletFeeDistributor} from "./TrustWalletFeeDistributor.sol";
import {AssetVerifier} from "./AssetVerifier.sol";



contract WalletSwapMain is Ownable, ReentrancyGuard {
    VirtualLiquidityPool public liquidityPool;
    EulerLagrangeOrderProcessor public orderProcessor;
    TrustWalletFeeDistributor public feeDistributor;
    AssetVerifier public assetVerifier;

    enum AssetType { ERC20, ERC721 }

    address public constant SYSTEM_CONTRACT = address(uint160(0xFFFFFF));
    address public authorizedReactiveVM;
    address public callbackProxy;



    event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, AssetType typeIn, AssetType typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp);
    event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp);
    event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp);
    event CrossChainCallbackExecuted(bytes32 indexed callbackId, bytes32 indexed orderId, uint256 amountOut, uint256 timestamp);
    event WalletSwapMainInitialized(address indexed owner);
    
    constructor(address _pool, address _proc, address _fee, address _asset) {
        liquidityPool = VirtualLiquidityPool(_pool);
        orderProcessor = EulerLagrangeOrderProcessor(_proc);
        feeDistributor = TrustWalletFeeDistributor(payable(_fee));
        assetVerifier = AssetVerifier(_asset);
        emit WalletSwapMainInitialized(msg.sender);
    }

    function createOrder(
        address tokenIn, address tokenOut, AssetType typeIn, AssetType typeOut,
        uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut,
        uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId
    ) external payable nonReentrant returns (bytes32) {
        uint256 fee = feeDistributor.calculateFee(tokenIn, TrustWalletFeeDistributor.AssetType(uint8(typeIn)), amountIn, minutesValueIn);
        
        if (tokenIn == address(0)) {
            require(msg.value >= amountIn + fee, "Insufficient native sent");
        } else if (typeIn == AssetType.ERC721) {
            require(msg.value >= fee, "Insufficient fee for NFT");
        }
        
        feeDistributor.distributeFee{value: msg.value > (tokenIn == address(0) ? amountIn : 0) ? fee : msg.value}(
             tokenIn, TrustWalletFeeDistributor.AssetType(uint8(typeIn)), amountIn, minutesValueIn, msg.sender, keccak256(abi.encodePacked(msg.sender, block.timestamp))
        );
        
        bytes32 orderId = orderProcessor.createOrder(
            msg.sender, tokenIn, tokenOut, EulerLagrangeOrderProcessor.AssetType(uint8(typeIn)), EulerLagrangeOrderProcessor.AssetType(uint8(typeOut)),
            amountIn, amountOut, minutesValueIn, minutesValueOut, slippageTolerance, block.timestamp + duration, enableRebooking, targetChainId
        );
        
        emit OrderInitiated(orderId, msg.sender, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, targetChainId, block.timestamp);
        
        // AUTOMATIC INSTANT MATCHING: ALWAYS check for compatible orders and execute immediately
        // NOTE: Instant matching ONLY (RSC disabled for simplicity)
        emit MatchAttempted(orderId, tokenIn, tokenOut);
        bytes32 matchOrderId = orderProcessor.findMatchingOrder(tokenIn, tokenOut, amountIn, amountOut);
        if (matchOrderId != bytes32(0)) {
            EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
            EulerLagrangeOrderProcessor.Order memory matchOrder = orderProcessor.getOrder(matchOrderId);
            
            // Execute instant match
            _executeMatch(orderId, matchOrderId, order, matchOrder);
            emit OrderAutoMatched(orderId, matchOrderId, block.timestamp);
        }
        
        return orderId;
    }

    event MatchAttempted(bytes32 indexed orderId, address tokenIn, address tokenOut);
    event MatchCalculated(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 amountAtoB, uint256 amountBtoA);

    function _executeMatch(
        bytes32 orderIdA,
        bytes32 orderIdB,
        EulerLagrangeOrderProcessor.Order memory orderA,
        EulerLagrangeOrderProcessor.Order memory orderB
    ) private {
        // A is the initiator (new order), B is the existing order (may be partially filled)
        // Calculate REMAINING amounts for B
        
        uint256 remainingBIn;  // What B still needs to receive (B's tokenOut = A's tokenIn)
        uint256 remainingBOut; // What B still has to offer (B's tokenIn = A's tokenOut)
        
        if (orderB.filledAmount > 0) {
            // B is partially filled - calculate remaining amounts
            remainingBOut = orderB.amountOut - orderB.filledAmount;
            remainingBIn = (remainingBOut * orderB.amountIn) / orderB.amountOut;
        } else {
            // B is unfilled - use full amounts
            remainingBIn = orderB.amountIn;
            remainingBOut = orderB.amountOut;
        }
        
        // Calculate ACTUAL tradeable amounts (may be limited by either side)
        // B wants to RECEIVE remainingBOut from A (A's tokenIn)
        // A wants to RECEIVE orderA.amountOut from B (B's tokenIn)
        // B can GIVE remainingBIn to A
        // A can GIVE orderA.amountIn to B
        
        // The limiting factor is the SMALLER of:
        // 1. What A can give vs what B still needs: min(orderA.amountIn, remainingBOut)
        // 2. What B can give vs what A wants:       min(remainingBIn, orderA.amountOut)
        
        uint256 amountAtoB; // What A actually gives to B
        uint256 amountBtoA; // What B actually gives to A
        
        // Check which side is the limiting factor
        if (orderA.amountIn >= remainingBOut) {
            // A can fully satisfy B's remaining needs
            amountAtoB = remainingBOut;
            // B gives proportionally based on B's rate
            amountBtoA = remainingBIn;
        } else {
            // A can only partially satisfy B (A doesn't have enough for B's full remaining)
            amountAtoB = orderA.amountIn;
            // B gives proportionally: (amountAtoB * B.amountIn) / B.amountOut
            amountBtoA = (amountAtoB * orderB.amountIn) / orderB.amountOut;
        }
        
        // Safety: ensure amountBtoA doesn't exceed what A requested
        if (amountBtoA > orderA.amountOut) {
            amountBtoA = orderA.amountOut;
            // Recalculate amountAtoB proportionally
            amountAtoB = (amountBtoA * orderB.amountOut) / orderB.amountIn;
        }
        
        // Final safety checks: amounts must be positive
        require(amountAtoB > 0, "Zero trade amount");
        require(amountBtoA > 0, "Zero trade amount");

        emit MatchCalculated(orderIdA, orderIdB, amountAtoB, amountBtoA);

        // 1. Transfer B's provide (amountBtoA) FROM B TO A
        if (orderA.tokenOut == address(0)) {
            // Funds are already in the contract from B's createOrder (native ETH)
            payable(orderA.maker).transfer(amountBtoA);
        } else if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            // A gets tokens from B
            require(IERC20(orderA.tokenOut).transferFrom(orderB.maker, orderA.maker, amountBtoA), "B -> A Transfer failed");
        } else {
            IERC721(orderA.tokenOut).transferFrom(orderB.maker, orderA.maker, amountBtoA);
        }

        // 2. Transfer A's provide (amountAtoB) FROM A TO B
        if (orderB.tokenOut == address(0)) {
            // A sent ETH with this transaction
            payable(orderB.maker).transfer(amountAtoB);
            
            // REFUND SURPLUS ETH TO A (if A sent more than needed)
            if (orderA.amountIn > amountAtoB) {
                payable(orderA.maker).transfer(orderA.amountIn - amountAtoB);
            }
        } else if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            // A sends tokens to B
            require(IERC20(orderB.tokenOut).transferFrom(orderA.maker, orderB.maker, amountAtoB), "A -> B Transfer failed");
        } else {
            IERC721(orderB.tokenOut).transferFrom(orderA.maker, orderB.maker, amountAtoB);
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

        // Validate amounts are compatible
        if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC721 && orderB.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC721) {
            require(orderA.amountOut == orderB.amountIn, "NFT amount mismatch");
        } else if (orderA.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20 && orderB.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            require(orderA.amountOut <= orderB.amountIn, "Amount mismatch");
        }

        if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC721 && orderA.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC721) {
            require(orderB.amountOut == orderA.amountIn, "NFT amount mismatch");
        } else if (orderB.typeOut == EulerLagrangeOrderProcessor.AssetType.ERC20 && orderA.typeIn == EulerLagrangeOrderProcessor.AssetType.ERC20) {
            require(orderB.amountOut <= orderA.amountIn, "Amount mismatch");
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

    // DISABLED: RSC callback function commented out for instant-matching-only mode
    function executeInterChainOrder(address rvmId, bytes32 orderId, address beneficiary) external nonReentrant {
        require(msg.sender == callbackProxy || msg.sender == authorizedReactiveVM, "Unauthorized Proxy");
        require(rvmId == authorizedReactiveVM || authorizedReactiveVM == address(0), "Unauthorized RVM");
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        require(order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE, "Not Active");
        require(block.timestamp <= order.expiration, "Expired");
        require(beneficiary != address(0), "Invalid beneficiary");
        
        if (order.tokenIn == address(0)) {
            (bool s,) = beneficiary.call{value: order.amountIn}("");
            require(s, "ETH match failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            IERC721(order.tokenIn).transferFrom(order.maker, beneficiary, order.amountIn);
        } else {
             bool s = IERC20(order.tokenIn).transferFrom(order.maker, beneficiary, order.amountIn);
             require(s, "ERC20 match failed");
        }
        orderProcessor.updateOrderStatus(orderId, EulerLagrangeOrderProcessor.OrderStatus.FILLED);
        emit OrderExecuted(orderId, beneficiary, order.amountIn, block.timestamp);
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
                (bool success,) = msg.sender.call{value: refund}("");
                require(success, "Refund failed");
            }
        }
        // Note: ERC20/NFT tokens never left the user's wallet - they just approved them
        // The approval remains but the order is cancelled, so no transfer happens
    }

    function processExpiredOrderRefund(bytes32 orderId) external nonReentrant {
        require(msg.sender == address(orderProcessor), "Unauthorized");
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
        if (order.tokenIn == address(0)) {
             uint256 refund = _calculateRefundAmount(order);
             if (refund > 0) {
                 (bool success,) = order.maker.call{value: refund}("");
                 require(success, "Refund failed");
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
             if (debt > 0 && feeDistributor.getAccumulatedFees(address(0)) >= debt) {
                 feeDistributor.coverReactiveDebt(address(this), address(0));
             }
        }
    }

    function setAuthorizedReactiveVM(address _rvm) external onlyOwner {
        authorizedReactiveVM = _rvm;
    }

    function setCallbackProxy(address _proxy) external onlyOwner {
        callbackProxy = _proxy;
    }





    function updateComponents(address _lp, address _proc, address _fee, address _av) external onlyOwner {
        if (_lp != address(0)) liquidityPool = VirtualLiquidityPool(_lp);
        if (_proc != address(0)) orderProcessor = EulerLagrangeOrderProcessor(_proc);
        if (_fee != address(0)) feeDistributor = TrustWalletFeeDistributor(payable(_fee));
        if (_av != address(0)) assetVerifier = AssetVerifier(_av);
    }
    
    function estimateTokenMinutesValue(address, uint256 amount) public pure returns (uint256) { return amount; }
    function checkTokenVolumeRequirements() external pure {}

    function registerForDebtCoverage() external onlyOwner { feeDistributor.registerReactiveContract(address(this)); }
    function manualCoverDebt() external onlyOwner { _attemptDebtCoverage(); }
    function getDebtStatus() external view returns (uint256 debt, uint256 fees, bool can) {
        (bool s, bytes memory d) = SYSTEM_CONTRACT.staticcall(abi.encodeWithSignature("debts(address)", address(this)));
        if (s && d.length > 0) debt = abi.decode(d, (uint256));
        fees = feeDistributor.getAccumulatedFees(address(0));
        can = fees >= debt && debt > 0;
    }
    receive() external payable {}
}
