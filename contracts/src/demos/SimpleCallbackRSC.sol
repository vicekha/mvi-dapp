// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/abstract-base/AbstractReactive.sol";

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

        // Standard Reactive Setup - service and vendor already set by AbstractReactive
        // Just re-initialize for local testing if needed
    }

    function manualSubscribe() external {
        service.subscribe(
            originChainId,
            originToken,
            APPROVAL_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
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
