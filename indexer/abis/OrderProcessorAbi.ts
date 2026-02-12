export const OrderProcessorAbi = [
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "orderId", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "maker", "type": "address" },
            { "indexed": true, "internalType": "address", "name": "tokenIn", "type": "address" },
            { "indexed": false, "internalType": "address", "name": "tokenOut", "type": "address" },
            { "indexed": false, "internalType": "uint8", "name": "typeIn", "type": "uint8" },
            { "indexed": false, "internalType": "uint8", "name": "typeOut", "type": "uint8" },
            { "indexed": false, "internalType": "uint256", "name": "amountIn", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "amountOut", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "minutesValueIn", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "targetChainId", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "name": "OrderCreated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "orderId", "type": "bytes32" },
            { "indexed": false, "internalType": "uint256", "name": "filledAmount", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "remainingAmount", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "name": "OrderFilled",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "orderId", "type": "bytes32" },
            { "indexed": false, "internalType": "string", "name": "reason", "type": "string" },
            { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "name": "OrderCancelled",
        "type": "event"
    }
] as const;
