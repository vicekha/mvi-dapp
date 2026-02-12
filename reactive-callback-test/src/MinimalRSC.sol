// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

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

/**
 * @title MinimalRSC
 * @notice A minimal Reactive Smart Contract for testing cross-chain callbacks
 * @dev Based on official Reactive Network demos - self-contained with no external deps
 */
contract MinimalRSC is IReactive {
    // System contract address on Reactive Network
    ISystemContract public constant SERVICE_ADDR = ISystemContract(0x0000000000000000000000000000000000fffFfF);
    
    // Magic value to ignore a topic/param
    uint256 public constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    
    // ERC20 Approval topic: keccak256("Approval(address,address,uint256)")
    uint256 public constant APPROVAL_TOPIC = 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925;
    
    // Configuration
    uint256 public originChainId;
    address public originContract;
    uint256 public destinationChainId;
    address public callbackReceiver;
    
    // State
    bool public vm;
    uint256 public reactCount;
    
    // Events
    event Subscribed(uint256 chainId, address _contract, uint256 topic);
    event Reacted(uint256 chainId, address _contract, uint256 topic0);
    event Callback(uint256 indexed chainId, address indexed _contract, uint64 gasLimit, bytes payload);
    
    constructor(
        uint256 _originChainId,
        address _originContract,
        uint256 _destinationChainId,
        address _callbackReceiver
    ) payable {
        originChainId = _originChainId;
        originContract = _originContract;
        destinationChainId = _destinationChainId;
        callbackReceiver = _callbackReceiver;
        
        // Detect if running in VM (Foundry test environment)
        vm = detectVm();
        
        // Auto-subscribe on deployment (only if not in VM)
        if (!vm) {
            SERVICE_ADDR.subscribe(
                originChainId,
                originContract,
                APPROVAL_TOPIC,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            emit Subscribed(originChainId, originContract, APPROVAL_TOPIC);
        }
    }
    
    function detectVm() internal returns (bool result) {
        bytes32 codehash;
        assembly {
            codehash := extcodehash(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D)
        }
        result = codehash != 0 && codehash != 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;
    }
    
    function react(LogRecord calldata log) external override {
        require(msg.sender == address(SERVICE_ADDR) || vm, "Unauthorized");
        
        reactCount++;
        emit Reacted(log.chain_id, log._contract, log.topic_0);
        
        if (log.topic_0 == APPROVAL_TOPIC) {
            // Build callback payload
            bytes memory payload = abi.encodeWithSignature(
                "ping(string)",
                "Hello from Reactive!"
            );
            
            // Emit callback event
            emit Callback(destinationChainId, callbackReceiver, 1000000, payload);
        }
    }
    
    // Manual subscription for testing
    function manualSubscribe() external {
        SERVICE_ADDR.subscribe(
            originChainId,
            originContract,
            APPROVAL_TOPIC,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        emit Subscribed(originChainId, originContract, APPROVAL_TOPIC);
    }
    
    receive() external payable {}
}
