// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "reactive-lib/abstract-base/AbstractReactive.sol";

contract ReactiveCallback is AbstractReactive {
    uint256 public originChainId;
    address public originOrderProcessor;
    address public originWalletSwapMain;
    uint256 public destinationChainId;
    address public destinationOrderProcessor;
    address public destinationWalletSwapMain;

    uint256 public constant ORDER_CREATED_TOPIC_0 = 0x54d85ef8201aba816135bce3c50a9e9853f0f63619b192e668d028a9fdaaa7ce;

    struct Order {
        bytes32 orderId;
        address maker;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        uint256 sourceChainId;
    }

    mapping(uint256 => mapping(address => mapping(address => Order[]))) public orderBookByChain;

    constructor(
        uint256 _originChainId,
        address _originOrderProcessor,
        address _originWalletSwapMain,
        uint256 _destinationChainId,
        address _destinationOrderProcessor,
        address _destinationWalletSwapMain
    ) payable {
        originChainId = _originChainId;
        originOrderProcessor = _originOrderProcessor;
        originWalletSwapMain = _originWalletSwapMain;
        destinationChainId = _destinationChainId;
        destinationOrderProcessor = _destinationOrderProcessor;
        destinationWalletSwapMain = _destinationWalletSwapMain;

        // Note: service, vendor, and authorized sender are initialized by AbstractReactive constructor
        // We just call detectVm() to set the 'vm' boolean if not already done
        if (!vm) {
            detectVm();
        }

        if (!vm) {
            service.subscribe(
                originChainId,
                originOrderProcessor,
                ORDER_CREATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
            service.subscribe(
                destinationChainId,
                destinationOrderProcessor,
                ORDER_CREATED_TOPIC_0,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE,
                REACTIVE_IGNORE
            );
        }
    }

    function react(LogRecord calldata log) external override vmOnly {
        uint256 chain_id = log.chain_id;
        address _contract = log._contract;
        uint256 topic_0 = log.topic_0;
        uint256 topic_1 = log.topic_1;
        uint256 topic_2 = log.topic_2;
        uint256 topic_3 = log.topic_3;
        bytes calldata data = log.data;

        bool isOrigin = (chain_id == originChainId && _contract == originOrderProcessor);
        bool isDest = (chain_id == destinationChainId && _contract == destinationOrderProcessor);

        if (!isOrigin && !isDest) {
            return;
        }

        if (topic_0 == ORDER_CREATED_TOPIC_0) {
            bytes32 orderId = bytes32(topic_1);
            address maker = address(uint160(topic_2));
            address tokenIn = address(uint160(topic_3));

            // Decode non-indexed parameters (V13 layout: tokenOut, typeIn, typeOut, amountIn, amountOut,
            // minutesValueIn, timestamp)
            (address tokenOut,,, uint256 amountIn, uint256 amountOut,,) =
                abi.decode(data, (address, uint8, uint8, uint256, uint256, uint256, uint256));

            Order memory newOrder = Order({
                orderId: orderId,
                maker: maker,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                amountOut: amountOut,
                sourceChainId: chain_id
            });

            uint256 counterChainId = (chain_id == originChainId) ? destinationChainId : originChainId;
            Order[] storage counterOrders = orderBookByChain[counterChainId][tokenOut][tokenIn];

            bool matched = false;
            for (uint256 i = 0; i < counterOrders.length; i++) {
                Order storage counterOrder = counterOrders[i];

                if (counterOrder.amountIn >= newOrder.amountOut && newOrder.amountIn >= counterOrder.amountOut) {
                    bytes memory payload1 = abi.encodeWithSignature(
                        "executeCrossChainOrder(address,bytes32,address)",
                        address(0), // RVM ID placeholder
                        newOrder.orderId,
                        counterOrder.maker
                    );

                    bytes memory payload2 = abi.encodeWithSignature(
                        "executeCrossChainOrder(address,bytes32,address)",
                        address(0), // RVM ID placeholder
                        counterOrder.orderId,
                        newOrder.maker
                    );

                    emit Callback(
                        newOrder.sourceChainId,
                        (newOrder.sourceChainId == originChainId ? originWalletSwapMain : destinationWalletSwapMain),
                        500000,
                        payload1
                    );
                    emit Callback(
                        counterOrder.sourceChainId,
                        (counterOrder.sourceChainId == originChainId
                                ? originWalletSwapMain
                                : destinationWalletSwapMain),
                        500000,
                        payload2
                    );

                    counterOrders[i] = counterOrders[counterOrders.length - 1];
                    counterOrders.pop();

                    matched = true;
                    break;
                }
            }

            // If no cross-chain match found, check for Intra-Chain (Same Chain) match
            if (!matched) {
                Order[] storage sameChainOrders = orderBookByChain[chain_id][tokenOut][tokenIn];
                for (uint256 i = 0; i < sameChainOrders.length; i++) {
                    Order storage counterOrder = sameChainOrders[i];

                    // Match logic (A.amountIn >= B.amountOut && B.amountIn >= A.amountOut)
                    if (counterOrder.amountIn >= newOrder.amountOut && newOrder.amountIn >= counterOrder.amountOut) {
                        
                        // Execute Intra-Chain Match (matchOrders)
                        bytes memory payload = abi.encodeWithSignature(
                            "matchOrders(bytes32,bytes32)",
                            newOrder.orderId,
                            counterOrder.orderId
                        );

                        emit Callback(
                            chain_id,
                            (chain_id == originChainId ? originWalletSwapMain : destinationWalletSwapMain),
                            1000000, // Increased gas limit for matchOrders
                            payload
                        );

                        // Remove filled order from book
                        sameChainOrders[i] = sameChainOrders[sameChainOrders.length - 1];
                        sameChainOrders.pop();

                        matched = true;
                        break;
                    }
                }
            }

            if (!matched) {
                orderBookByChain[chain_id][tokenIn][tokenOut].push(newOrder);
            }
        }
    }

    function subscribe() external payable rnOnly {
        service.subscribe(
            originChainId,
            originOrderProcessor,
            ORDER_CREATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        service.subscribe(
            destinationChainId,
            destinationOrderProcessor,
            ORDER_CREATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }

    function unsubscribe() external rnOnly {
        service.unsubscribe(
            originChainId,
            originOrderProcessor,
            ORDER_CREATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
        service.unsubscribe(
            destinationChainId,
            destinationOrderProcessor,
            ORDER_CREATED_TOPIC_0,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE
        );
    }
}
