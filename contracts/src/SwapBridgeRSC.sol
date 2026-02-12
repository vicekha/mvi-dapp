// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/abstract-base/AbstractReactive.sol";
import "reactive-lib/interfaces/ISystemContract.sol";
import "reactive-lib/interfaces/IReactive.sol";

/**
 * @title SwapBridgeRSC
 * @notice Reactive Smart Contract that monitors BridgeSwapRequested events,
 *         calculates the payout amount, and triggers executePayout on the target chain.
 */
contract SwapBridgeRSC is AbstractReactive {
    // keccak256("BridgeSwapRequested(bytes32,address,uint256,address,address,uint256,uint256)")
    bytes32 constant BRIDGE_SWAP_REQUESTED_TOPIC = keccak256("BridgeSwapRequested(bytes32,address,uint256,address,address,uint256,uint256)");
    
    uint64 private constant GAS_LIMIT = 2000000;

    // Simple fixed rate for demo: 1:1 swap
    // In production, this would use an oracle or a virtual pool logic
    uint256 public constant SWAP_RATE_DENOMINATOR = 1000;
    uint256 public swapRate = 1000; // 1:1

    address public owner;
    
    // Mapping: chainId -> BridgeSwapMain address
    mapping(uint256 => address) public bridgeSwapMains;

    constructor() {
        owner = msg.sender;
    }

    function setBridgeSwapMain(uint256 chainId, address addr) external {
        require(msg.sender == owner, "Only owner");
        bridgeSwapMains[chainId] = addr;
    }

    function subscribe(uint256 chainId, address contractAddr) external {
        require(msg.sender == owner, "Only owner");
        service.subscribe(
            chainId,
            contractAddr,
            uint256(BRIDGE_SWAP_REQUESTED_TOPIC),
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }

    function react(IReactive.LogRecord calldata log) external override {
        if (log.topic_0 != uint256(BRIDGE_SWAP_REQUESTED_TOPIC)) return;

        // Decode: (address tokenIn, address tokenOut, uint256 amountIn, uint256 timestamp)
        // topic_1: orderId, topic_2: maker, topic_3: targetChainId
        (address tokenIn, address tokenOut, uint256 amountIn, ) = 
            abi.decode(log.data, (address, address, uint256, uint256));

        bytes32 orderId = bytes32(log.topic_1);
        address maker = address(uint160(log.topic_2));
        uint256 targetChainId = log.topic_3;

        address destinationContract = bridgeSwapMains[targetChainId];
        if (destinationContract == address(0)) return; // Destination not configured

        // Calculate payout amount (1:1 for now)
        uint256 amountOut = (amountIn * swapRate) / SWAP_RATE_DENOMINATOR;

        // Prepare callback payload
        bytes memory payload = abi.encodeWithSignature(
            "executePayout(bytes32,address,address,uint256)",
            orderId,
            maker,
            tokenOut,
            amountOut
        );

        // Emit callback to destination chain
        emit Callback(
            targetChainId,
            destinationContract,
            GAS_LIMIT,
            payload
        );
    }
}
