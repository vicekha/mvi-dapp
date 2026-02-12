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
        
        // ALL Matching is handled by the Reactive Network (RSC)
        // We attempt debt coverage to ensure RSC can react even if not subscribed yet (optional optimization)
        _attemptDebtCoverage();
        
        return orderId;
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

    // Removed manual matchOrders and _executeMatch as they are no longer used.
    // The RSC handles all matching via executeInterChainOrder.

    function executeInterChainOrder(address rvmId, bytes32 orderId, address beneficiary, uint256 amountToFill) external nonReentrant {
        require(msg.sender == callbackProxy, "Unauthorized Proxy");
        require(rvmId == authorizedReactiveVM, "Unauthorized RVM");
        EulerLagrangeOrderProcessor.Order memory order = orderProcessor.getOrder(orderId);
         // Allow ACTIVE or PARTIALLY_FILLED
        require(order.status == EulerLagrangeOrderProcessor.OrderStatus.ACTIVE || order.status == EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED, "Not Active");
        require(block.timestamp <= order.expiration, "Expired");
        require(beneficiary != address(0), "Invalid beneficiary");
        
        // Update filled amount
        uint256 newFilled = order.filledAmount + amountToFill;
        // Check if fully filled (using amountIn as the reference for "what was taken from maker" or "what maker pays"?)
        // The callback amount (amountAtoB) is what the MAKER PAYS (amountIn).
        // Let's verify RSC logic: 
        // amountAtoB = amountIn (or part). This is the ASSET WE TRANSFER.
        // So we track filledAmount in terms of INPUT or OUTPUT?
        // Processor usually tracks filledAmount as OUTPUT (e.g. amountOut).
        // Let's check Processor: `order.filledAmount = order.amountOut;` in updateOrderStatus.
        // So filledAmount tracks OUTPUT.
        // BUT `amountToFill` passing from RSC depends on my implementation there.
        // In RSC: `amountAtoB` is `amountIn` (from Maker's perspective).
        // So `amountToFill` IS `amountIn`. 
        // Wait. Processor expects `filledAmount` to be `amountOut`?
        // If I update `filledAmount` with `amountIn` values, I break the logic.
        // I need to scale it. 
        // Or simply track input volume?
        // Let's look at `_calculateRefundAmount`: `obligated = (order.filledAmount * order.amountIn) / order.amountOut;`
        // This implies `filledAmount` IS matching `amountOut` units.
        
        // PROBLEM: My RSC is passing `amountAtoB`.
        // If Maker A offers 150 USDC (In) for 150 USDT (Out).
        // callback sends `amountAtoB` = 100 USDC. (Transfer amount).
        // If I record "100" as filledAmount, does it mean 100 USDT or 100 USDC?
        // In 1:1 swap it's same.
        // But if 1 ETH for 2000 USDC.
        // fillAmountA = 1 ETH. 
        // If I write filledAmount = 1, and amountOut = 2000.
        // Refund calc: (1 * 1) / 2000 = 0.0005 ETH obligated?? NO.
        // If filledAmount is OUTPUT units:
        // We need to pass OUTPUT units to this function, or convert.
        
        // Simpler: The RSC logic calculated `fillAmountA` (what A gives) and `fillAmountB` (what A gets).
        // Passed `fillAmountA` to A's chain callback.
        // So `amountToFill` here is INPUT AMOUNT.
        
        // I should convert INPUT AMOUNT to OUTPUT AMOUNT for storage?
        // `filledOutput = (amountToFill * order.amountOut) / order.amountIn;`
        
        uint256 filledOutputDelta = (amountToFill * order.amountOut) / order.amountIn;
        newFilled = order.filledAmount + filledOutputDelta;

        EulerLagrangeOrderProcessor.OrderStatus newStatus = (newFilled >= order.amountOut) 
            ? EulerLagrangeOrderProcessor.OrderStatus.FILLED 
            : EulerLagrangeOrderProcessor.OrderStatus.PARTIALLY_FILLED;

        // Execute Transfer
        if (order.tokenIn == address(0)) {
            (bool s,) = beneficiary.call{value: amountToFill}("");
            require(s, "ETH match failed");
        } else if (uint256(order.typeIn) == uint256(AssetType.ERC721)) {
            IERC721(order.tokenIn).transferFrom(order.maker, beneficiary, amountToFill); // tokenId == amountIn for NFT
        } else {
             bool s = IERC20(order.tokenIn).transferFrom(order.maker, beneficiary, amountToFill);
             require(s, "ERC20 match failed");
        }
        
        orderProcessor.updateOrderFilledState(orderId, newFilled, newStatus);
        emit OrderExecuted(orderId, beneficiary, amountToFill, block.timestamp);
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
