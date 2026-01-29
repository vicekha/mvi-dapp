// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../lib/reactive-lib/src/abstract-base/AbstractReactive.sol";
import "../lib/reactive-lib/src/interfaces/ISystemContract.sol";
import "../lib/reactive-lib/src/interfaces/IReactive.sol";

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
    uint64 private constant GAS_LIMIT = 5000000; // Adjust as needed

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

        for (uint c = 0; c < chainsToCheck.length; c++) {
            uint256 candidateChainId = chainsToCheck[c];
            
            // If the order explicitly targets a chain, skip if this candidate chain is not the target
            if (targetChainId != 0 && targetChainId != candidateChainId) continue;
            
            // Skip checking remote chain if it's the same as local (duplicate check) 
            // although the logic handles it, it's efficient to minimize. 
            // But here candidateChainId == localChainId is the "Local Match" case.
            
            Order[] storage candidates = orders[candidateChainId][tokenOut][tokenIn];
            
            for (uint i = 0; i < candidates.length; i++) {
                Order memory candidate = candidates[i];
                
                // 1. Target Chain Check (Candidate side)
                // Candidate must be willing to match with this chain (log.chain_id)
                if (candidate.targetChainId != 0 && candidate.targetChainId != localChainId) continue;

                // 2. Asset Types Must Match:
                bool typesMatch = (candidate.typeIn == typeOut) && (candidate.typeOut == typeIn);
                if (!typesMatch) continue;
                
                // 3. Amounts Must be Compatible:
                bool matchAmounts = false;
                
                if (typeIn == 1 && typeOut == 1) { 
                     matchAmounts = (candidate.amountIn == amountOut) && (candidate.amountOut == amountIn);
                }
                else if (typeIn == 0 && typeOut == 0) {
                     matchAmounts = (candidate.amountIn >= amountOut) && (candidate.amountOut <= amountIn);
                }
                else if (typeIn == 1 && typeOut == 0) {
                     matchAmounts = (candidate.amountIn >= amountOut) && (candidate.amountOut == amountIn);
                }
                else if (typeIn == 0 && typeOut == 1) {
                     matchAmounts = (candidate.amountIn == amountOut) && (candidate.amountOut <= amountIn);
                }
                
                if (matchAmounts) {
                    // MATCH FOUND!
                    address localWalletSwap = (localChainId == chainA) ? walletSwapA : walletSwapB;
                    address candidateWalletSwap = (candidateChainId == chainA) ? walletSwapA : walletSwapB;

                    // Execute on Local (Origin) -> Transfer assets from Local Maker to Beneficiary (which is Candidate Maker)
                    emit Callback(
                        localChainId,
                        localWalletSwap,
                        GAS_LIMIT,
                        abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address)", address(this), orderId, candidate.maker)
                    );

                    // Execute on Candidate Chain -> Transfer assets from Candidate Maker to Beneficiary (which is Local Maker)
                    // Note: If candidateChainId == localChainId, this is a second callback to the same chain.
                    emit Callback(
                        candidateChainId,
                        candidateWalletSwap,
                        GAS_LIMIT,
                        abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address)", address(this), candidate.orderId, maker)
                    );

                    emit MatchFound(orderId, candidate.orderId, block.timestamp);
                    
                    // Remove candidate from storage
                    candidates[i] = candidates[candidates.length - 1];
                    candidates.pop();
                    return; // Matched and done
                }
            }
        }
        
        // No match found, store this order
        orders[log.chain_id][tokenIn][tokenOut].push(Order({
            orderId: orderId,
            maker: maker,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            typeIn: typeIn,
            typeOut: typeOut,
            amountIn: amountIn,
            amountOut: amountOut,
            timestamp: timestamp,
            chainId: log.chain_id,
            targetChainId: targetChainId
        }));
    }

}
