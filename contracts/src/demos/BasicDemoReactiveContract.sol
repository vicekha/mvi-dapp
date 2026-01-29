// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0;

import "reactive-lib/interfaces/IReactive.sol";
import "reactive-lib/abstract-base/AbstractReactive.sol";
import "reactive-lib/interfaces/ISystemContract.sol";

/**
 * @title BasicDemoReactiveContract
 * @notice Official Reactive Network basic demo - copied exactly from their GitHub
 * @dev Used to test if the Reactive Network is working at all
 */
contract BasicDemoReactiveContract is IReactive, AbstractReactive {

    uint256 public originChainId;
    uint256 public destinationChainId;
    uint64 private constant GAS_LIMIT = 1000000;

    address private callback;
    uint256 public reactCount;

    event ReactCalled(uint256 chainId, uint256 topic0, uint256 topic3);

    constructor(
        address _service,
        uint256 _originChainId,
        uint256 _destinationChainId,
        address _contract,
        uint256 _topic_0,
        address _callback
    ) payable {
        service = ISystemContract(payable(_service));

        originChainId = _originChainId;
        destinationChainId = _destinationChainId;
        callback = _callback;

        if (!vm) {
            service.subscribe(
                originChainId,
                _contract,
                _topic_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    function react(LogRecord calldata log) external vmOnly {
        reactCount++;
        emit ReactCalled(log.chain_id, log.topic_0, log.topic_3);

        if (log.topic_3 >= 0.001 ether) {
            bytes memory payload = abi.encodeWithSignature("callback(address)", address(0));
            emit Callback(destinationChainId, callback, GAS_LIMIT, payload);
        }
    }
}
