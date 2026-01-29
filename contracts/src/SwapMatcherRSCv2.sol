// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SwapMatcherRSCv2
 * @notice Simplified Reactive Smart Contract based on proven MinimalRSC pattern
 * @dev Self-contained without complex library inheritance for maximum reliability
 */

// Minimal IReactive interface
interface IReactive {
    struct LogRecord {
        uint256 chain_id;
        address _contract;
        uint256 topic_0;
        uint256 topic_1;
        uint256 topic_2;
        uint256 topic_3;
        bytes data;
        uint256 block_number;
        uint256 op_code;
        uint256 block_hash;
        uint256 tx_hash;
        uint256 log_index;
    }

    function react(LogRecord calldata log) external;
}

// Minimal ISystemContract interface
interface ISystemContract {
    function subscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;

    function unsubscribe(
        uint256 chain_id,
        address _contract,
        uint256 topic_0,
        uint256 topic_1,
        uint256 topic_2,
        uint256 topic_3
    ) external;
}

contract SwapMatcherRSCv2 is IReactive {
    // System contract address on Reactive Network
    ISystemContract public constant SERVICE_ADDR = ISystemContract(0x0000000000000000000000000000000000fffFfF);
    
    // Magic value to ignore a topic/param
    uint256 public constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    
    // keccak256("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)")
    uint256 public constant ORDER_INITIATED_TOPIC = 0x058e802e2eed1657b621419f51940b8d60d9ff78dca249f39084606796695333;
    
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

    // Mapping: chainId -> tokenIn -> tokenOut -> Order[]
    mapping(uint256 => mapping(address => mapping(address => Order[]))) private orders;

    uint256 public chainA;
    uint256 public chainB;
    address public walletSwapA;
    address public walletSwapB;

    address public owner;
    bool public vm;
    uint256 public reactCount;
    
    event MatchFound(bytes32 indexed orderA, bytes32 indexed orderB, uint256 timestamp);
    event OrderStored(bytes32 indexed orderId, uint256 chainId, address tokenIn, address tokenOut);
    event Callback(uint256 indexed chainId, address indexed _contract, uint64 gasLimit, bytes payload);
    event ReactCalled(uint256 chainId, uint256 topic0, uint256 blockNumber);

    constructor(
        uint256 _chainA,
        uint256 _chainB,
        address _walletSwapA,
        address _walletSwapB
    ) payable {
        owner = msg.sender;
        chainA = _chainA;
        chainB = _chainB;
        walletSwapA = _walletSwapA;
        walletSwapB = _walletSwapB;
        
        // Detect if running in VM (Foundry test environment)
        vm = detectVm();
        
        // NOTE: Auto-subscribe removed - calling SERVICE_ADDR.subscribe() in constructor causes revert
        // Use manualSubscribe() after deployment instead
    }
    
    function detectVm() internal view returns (bool result) {
        uint256 size;
        assembly { size := extcodesize(0x0000000000000000000000000000000000fffFfF) }
        result = size == 0;
    }
    
    function manualSubscribe(uint256 chainId, address contractAddr) external {
        require(msg.sender == owner, "Only owner");
        SERVICE_ADDR.subscribe(chainId, contractAddr, ORDER_INITIATED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function react(LogRecord calldata log) external override {
        // Authorization check - only SERVICE_ADDR can call (or VM for testing)
        require(msg.sender == address(SERVICE_ADDR) || vm, "Unauthorized");
        
        reactCount++;
        emit ReactCalled(log.chain_id, log.topic_0, log.block_number);
        
        if (log.topic_0 != ORDER_INITIATED_TOPIC) return;
        
        (address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp) = 
            abi.decode(log.data, (address, address, uint8, uint8, uint256, uint256, uint256, uint256));
            
        bytes32 orderId = bytes32(log.topic_1);
        address maker = address(uint160(log.topic_2));
        
        uint256 localChainId = log.chain_id;
        uint256 remoteChainId = (localChainId == chainA) ? chainB : chainA;
        
        // Potential candidate chains to check
        uint256[] memory chainsToCheck = new uint256[](2);
        chainsToCheck[0] = localChainId;
        chainsToCheck[1] = remoteChainId;

        for (uint c = 0; c < chainsToCheck.length; c++) {
            uint256 candidateChainId = chainsToCheck[c];
            
            if (targetChainId != 0 && targetChainId != candidateChainId) continue;
            
            Order[] storage candidates = orders[candidateChainId][tokenOut][tokenIn];
            
            for (uint i = 0; i < candidates.length; i++) {
                Order memory candidate = candidates[i];
                
                if (candidate.targetChainId != 0 && candidate.targetChainId != localChainId) continue;

                bool typesMatch = (candidate.typeIn == typeOut) && (candidate.typeOut == typeIn);
                if (!typesMatch) continue;
                
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

                    // Execute on Local (Origin)
                    emit Callback(
                        localChainId,
                        localWalletSwap,
                        GAS_LIMIT,
                        abi.encodeWithSignature("executeInterChainOrder(address,bytes32,address)", address(this), orderId, candidate.maker)
                    );

                    // Execute on Candidate Chain
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
        
        emit OrderStored(orderId, log.chain_id, tokenIn, tokenOut);
    }

    function getOrderCount(uint256 chainId, address tIn, address tOut) external view returns (uint256) {
        return orders[chainId][tIn][tOut].length;
    }

    function getOrder(uint256 chainId, address tIn, address tOut, uint256 index) external view returns (Order memory) {
        return orders[chainId][tIn][tOut][index];
    }
    
    receive() external payable {}
}
