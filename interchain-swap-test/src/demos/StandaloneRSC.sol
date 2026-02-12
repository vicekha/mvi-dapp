// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

// ============================================
// IPayer.sol
// ============================================
interface IPayer {
    event FundsReceived(address indexed sender, uint256 amount);
    function pay(uint256 amount) external;
    receive() external payable;
}

// ============================================
// ISystemContract.sol
// ============================================
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

// ============================================
// IReactive.sol (Modified to extend IPayer directly if needed, but here we follow inheritance)
// ============================================
interface IReactive is IPayer {
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

    event Callback(uint256 indexed chain_id, address indexed _contract, uint64 indexed gas_limit, bytes payload);

    function react(LogRecord calldata log) external;
}

// ============================================
// AbstractPayer.sol
// ============================================
abstract contract AbstractPayer is IPayer {
    address internal vendor;
    mapping(address => bool) private authorized_senders;

    function addAuthorizedSender(address sender) internal {
        authorized_senders[sender] = true;
    }

    modifier onlyAuthorizedSender() {
        require(authorized_senders[msg.sender], "Not authorized");
        _;
    }

    function pay(uint256 amount) external onlyAuthorizedSender {
        (bool success, ) = payable(vendor).call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }
}

// ============================================
// AbstractReactive.sol
// ============================================
abstract contract AbstractReactive is IReactive, AbstractPayer {
    uint256 internal constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    ISystemContract internal constant SERVICE_ADDR = ISystemContract(payable(0x0000000000000000000000000000000000fffFfF));
    bool internal vm;
    ISystemContract internal service;

    constructor() {
        service = SERVICE_ADDR;
        vendor = address(SERVICE_ADDR);
        addAuthorizedSender(address(SERVICE_ADDR));
        detectVm();
    }

    modifier rnOnly() {
        require(!vm, "Reactive Network only");
        _;
    }

    modifier vmOnly() {
        require(vm, "VM only");
        _;
    }

    function detectVm() internal {
        uint256 size;
        assembly { size := extcodesize(0x0000000000000000000000000000000000fffFfF) }
        vm = size == 0;
    }
}

// ============================================
// SimpleCallbackRSC.sol
// ============================================
contract SimpleCallbackRSC is AbstractReactive {
    uint256 public originChainId;
    address public originToken;
    uint256 public destinationChainId;
    address public callbackReceiver;
    
    // Approval(address indexed owner, address indexed spender, uint256 value)
    uint256 public constant APPROVAL_TOPIC_0 = 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925;

    constructor(
        uint256 _originChainId,
        address _originToken,
        uint256 _destinationChainId,
        address _callbackReceiver
    ) payable {
        originChainId = _originChainId;
        originToken = _originToken;
        destinationChainId = _destinationChainId;
        callbackReceiver = _callbackReceiver;

        // Standard Reactive Setup
        service = SERVICE_ADDR;
        vendor = address(SERVICE_ADDR);
        
        // Auto-subscribe
        if (!vm) {
            service.subscribe(
                originChainId,
                originToken,
                APPROVAL_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    function react(LogRecord calldata log) external override vmOnly {
        if (log.topic_0 == APPROVAL_TOPIC_0) {
            // Emitting callback to Lasna Receiver
            bytes memory payload = abi.encodeWithSignature("ping(string)", "Hello from Sepolia!");
            
            emit Callback(
                destinationChainId,
                callbackReceiver,
                1000000,
                payload
            );
        }
    }
}
