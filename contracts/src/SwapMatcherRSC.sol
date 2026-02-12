// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/abstract-base/AbstractReactive.sol";
import "reactive-lib/interfaces/ISystemContract.sol";
import "reactive-lib/interfaces/IReactive.sol";

/**
 * @title SwapMatcherRSC
 * @notice Reactive Smart Contract that monitors OrderInitiated events on multiple chains,
 *         matches compatible orders, and triggers executeCrossChainOrder callbacks on both chains.
 */
contract SwapMatcherRSC is AbstractReactive {
    // keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)")
    bytes32 constant ORDER_INITIATED_TOPIC = keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)");
    // keccak256("OrderAutoMatched(bytes32,bytes32,uint256)")
    bytes32 constant ORDER_AUTO_MATCHED_TOPIC = keccak256("OrderAutoMatched(bytes32,bytes32,uint256)");
    uint64 private constant GAS_LIMIT = 5000000;

    struct Order {
        bytes32 orderId;
        address maker;
        address tokenIn;
        address tokenOut;
        uint8 typeIn;
        uint8 typeOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 timestamp;
        uint256 chainId;
        uint256 targetChainId;
    }

    // Mapping: chainId -> tokenOut -> tokenIn -> list of Orders
    // We categorize orders by what they OFFER (tokenIn) and what they WANT (tokenOut)
    // Actually, to find a match for a new order (In: A, Out: B), 
    // we want existing orders that (In: B, Out: A).
    // So if store orders by [tokenOut][tokenIn], it groups orders that "Want A, Offer B".
    // 
    // Mapping: chainId -> tokenIn -> tokenOut -> Order[]
    mapping(uint256 => mapping(address => mapping(address => Order[]))) private orders;

    function getOrderCount(uint256 chainId, address tIn, address tOut) external view returns (uint256) {
        return orders[chainId][tIn][tOut].length;
    }

    function getOrder(uint256 chainId, address tIn, address tOut, uint256 index) external view returns (Order memory) {
        return orders[chainId][tIn][tOut][index];
    }

    uint256 public chainA;
    uint256 public chainB;
    address public walletSwapA;
    address public walletSwapB;

    address public owner;
    bool public initialized;
    
    event MatchFound(bytes32 indexed orderA, bytes32 indexed orderB, uint256 timestamp);

    constructor(
        address _service,
        uint256 _chainA,
        uint256 _chainB,
        address _walletSwapA,
        address _walletSwapB
    ) {
        // AbstractReactive parent constructor is called implicitly.
        // It sets service = SERVICE_ADDR, vendor = SERVICE_ADDR, addAuthorizedSender(SERVICE_ADDR), and detectVm().
        // However, if we want a custom service address, we need to override AFTER the parent runs.
        // Since SERVICE_ADDR is a constant, we just use it from the parent. Our _service param can be ignored.
        // But the parent already sets service, so let's just NOT override it and trust the parent.
        
        owner = msg.sender;
        // Don't override service - use what AbstractReactive set from SERVICE_ADDR constant
        chainA = _chainA;
        chainB = _chainB;
        walletSwapA = _walletSwapA;
        walletSwapB = _walletSwapB;
    }

    function initialize() external {
        require(msg.sender == owner, "Only owner can initialize");
        require(!initialized, "Already initialized");

        // Subscribe to OrderInitiated events on both chains
        // FIXME: Subscriptions failing during deployment/init. Doing it manually later.
        // service.subscribe(chainA, walletSwapA, ORDER_INITIATED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        // service.subscribe(chainB, walletSwapB, ORDER_INITIATED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        initialized = true;
    }

    function manualSubscribe(uint256 chainId, address contractAddr) external {
        require(msg.sender == owner, "Only owner");
        service.subscribe(chainId, contractAddr, uint256(ORDER_INITIATED_TOPIC), REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function updateWalletSwaps(
        uint256 _chainA,
        uint256 _chainB,
        address _walletSwapA,
        address _walletSwapB
    ) external {
        require(msg.sender == owner, "Only owner");
        chainA = _chainA;
        chainB = _chainB;
        walletSwapA = _walletSwapA;
        walletSwapB = _walletSwapB;
    }
    


    function react(IReactive.LogRecord calldata log) external {
        if (log.topic_0 != uint256(ORDER_INITIATED_TOPIC)) return;
        
        (address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp) = 
            abi.decode(log.data, (address, address, uint8, uint8, uint256, uint256, uint256, uint256));
            
        bytes32 orderId = bytes32(log.topic_1);
        address maker = address(uint160(log.topic_2));
        
        // Define chains to check: [Local, Remote]
        // If we only have two chains configured (A and B), Remote is the other one.
        uint256 localChainId = log.chain_id;
        uint256 remoteChainId = (localChainId == chainA) ? chainB : chainA;
        
        // Potential candidate chains to check
        uint256[] memory chainsToCheck = new uint256[](2);
        chainsToCheck[0] = localChainId;
        chainsToCheck[1] = remoteChainId;

        uint256 currentAmountIn = amountIn;
        uint256 currentAmountOut = amountOut;

        for (uint c = 0; c < chainsToCheck.length; c++) {
            uint256 candidateChainId = chainsToCheck[c];
            if (targetChainId != 0 && targetChainId != candidateChainId) continue;

            Order[] storage candidates = orders[candidateChainId][tokenOut][tokenIn];

            // Iterate backwards to allow safe removal? Or just handle index carefuly. 
            // Forward iteration with explicit index management is better for Solidity storage arrays.
            for (uint i = 0; i < candidates.length; ) {
                if (currentAmountIn == 0) break; // Incoming fully filled

                Order storage candidate = candidates[i];

                // 1. Check constraints
                bool chainMatch = (candidate.targetChainId == 0 || candidate.targetChainId == localChainId);
                bool typesMatch = (candidate.typeIn == typeOut) && (candidate.typeOut == typeIn);
             
                if (!chainMatch || !typesMatch) {
                    i++;
                    continue;
                }

                // 2. Calculate Fill
                // Incoming: Wants B (amountOut), Offers A (amountIn)
                // Candidate: Wants A (amountOut), Offers B (amountIn)
                
                // Max B available from Candidate = candidate.amountIn
                // Max B needed by Incoming = currentAmountOut
                
                uint256 fillAmountB; // The amount of B transferred (Candidate -> Incoming)
                uint256 fillAmountA; // The amount of A transferred (Incoming -> Candidate)
                
                // Determine the limiting factor (The "Match Size")
                // We compare "B offered by Candidate" vs "B wanted by Incoming" at the current price ratio.
                // Assuming fixed price ratio for this specific match? 
                // Or simply: Take min(candidate.amountIn, currentAmountOut)?
                // And calculate corresponding A based on the ratio of the ORDER BEING FILLED.
                // Actually, simple AMM logic:
                
                // Case 1: Candidate is larger or equal (can fill entire remaining incoming)
                if (candidate.amountIn >= currentAmountOut) {
                    fillAmountB = currentAmountOut; // We get all B we want
                    fillAmountA = currentAmountIn;  // We give all A we have left
                    // Candidate state update:
                    candidate.amountIn -= fillAmountB;   // It gave B
                    candidate.amountOut -= fillAmountA;  // It received A (waiting for it) -- Wait, amountOut is what it WANTS. So it's satisfied by fillAmountA.
                    // So we subtract fillAmountA from its "want" amount.
                } 
                // Case 2: Candidate is smaller (partial fill of incoming)
                else {
                    fillAmountB = candidate.amountIn; // We take all B they have
                    // Calculate proportional A to give: (fillAmountB / currentAmountOut) * currentAmountIn
                    // Be careful with precision.
                    fillAmountA = (fillAmountB * currentAmountIn) / currentAmountOut;
                    
                    // Candidate is fully exhausted
                    candidate.amountIn = 0;
                    candidate.amountOut = 0; 
                }

                if (fillAmountA > 0 && fillAmountB > 0) {
                     // Execute Match
                    address localWalletSwap = (localChainId == chainA) ? walletSwapA : walletSwapB;
                    address candidateWalletSwap = (candidateChainId == chainA) ? walletSwapA : walletSwapB;

                    emit Callback(
                        localChainId,
                        localWalletSwap,
                        GAS_LIMIT,
                        abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address,uint256)", address(this), orderId, candidate.maker, fillAmountA)
                    );

                    emit Callback(
                        candidateChainId,
                        candidateWalletSwap,
                        GAS_LIMIT,
                        abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address,uint256)", address(this), candidate.orderId, maker, fillAmountB)
                    );

                    emit MatchFound(orderId, candidate.orderId, block.timestamp);
                    
                    // Update Local State (Incoming Order)
                    currentAmountIn -= fillAmountA;
                    currentAmountOut -= fillAmountB;

                    // Cleanup Candidate
                    if (candidate.amountIn == 0 || candidate.amountOut == 0) {
                        // Remove candidate
                        candidates[i] = candidates[candidates.length - 1];
                        candidates.pop();
                        // Do NOT increment i, because we swapped the last element closely into this slot. 
                        // We must re-check this slot in next iteration.
                        continue; 
                    }
                }
                
                i++; // Only increment if we didn't remove
            }
        }
        
        // Store remainder if not fully filled
        if (currentAmountIn > 0) {
            orders[log.chain_id][tokenIn][tokenOut].push(Order({
                orderId: orderId,
                maker: maker,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                typeIn: typeIn,
                typeOut: typeOut,
                amountIn: currentAmountIn,
                amountOut: currentAmountOut,
                timestamp: timestamp,
                chainId: log.chain_id,
                targetChainId: targetChainId
            }));
        }
    }

}
