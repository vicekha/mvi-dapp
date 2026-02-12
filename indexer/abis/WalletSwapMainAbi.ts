export const WalletSwapMainAbi = [
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "orderId", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "maker", "type": "address" },
            { "indexed": false, "internalType": "address", "name": "tokenIn", "type": "address" },
            { "indexed": false, "internalType": "address", "name": "tokenOut", "type": "address" },
            { "indexed": false, "internalType": "uint8", "name": "typeIn", "type": "uint8" },
            { "indexed": false, "internalType": "uint8", "name": "typeOut", "type": "uint8" },
            { "indexed": false, "internalType": "uint256", "name": "amountIn", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "amountOut", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "targetChainId", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "name": "OrderInitiated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "internalType": "bytes32", "name": "orderId", "type": "bytes32" },
            { "indexed": true, "internalType": "address", "name": "taker", "type": "address" },
            { "indexed": false, "internalType": "uint256", "name": "amountOut", "type": "uint256" },
            { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "name": "OrderExecuted",
        "type": "event"
    }
] as const;
