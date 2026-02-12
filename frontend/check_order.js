import { ethers } from 'ethers';

const RPC_URL = "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b";
const PROCESSOR_ADDRESS = "0x8C7c2C9993c5eaF5dB3d1a926278CBE0686bFe45";
const TX_HASH = "0x0c43e3be4aa3358a4232d227ecc6318dc043208102b8e9f42adbb43cb59bec68";

const ABI = [
    {
        "type": "event",
        "name": "OrderCreated",
        "inputs": [
            { "name": "orderId", "type": "bytes32", "indexed": true },
            { "name": "maker", "type": "address", "indexed": true },
            { "name": "tokenIn", "type": "address", "indexed": true },
            { "name": "tokenOut", "type": "address", "indexed": false },
            { "name": "typeIn", "type": "uint8", "indexed": false },
            { "name": "typeOut", "type": "uint8", "indexed": false },
            { "name": "amountIn", "type": "uint256", "indexed": false },
            { "name": "amountOut", "type": "uint256", "indexed": false },
            { "name": "minutesValueIn", "type": "uint256", "indexed": false },
            { "name": "timestamp", "type": "uint256", "indexed": false }
        ],
        "anonymous": false
    },
    {
        "type": "function",
        "name": "orders",
        "inputs": [{ "name": "orderId", "type": "bytes32" }],
        "outputs": [
            { "name": "maker", "type": "address" },
            { "name": "tokenIn", "type": "address" },
            { "name": "tokenOut", "type": "address" },
            { "name": "typeIn", "type": "uint8" },
            { "name": "typeOut", "type": "uint8" },
            { "name": "amountIn", "type": "uint256" },
            { "name": "amountOut", "type": "uint256" },
            { "name": "minutesValueIn", "type": "uint256" },
            { "name": "minutesValueOut", "type": "uint256" },
            { "name": "slippageTolerance", "type": "uint256" },
            { "name": "filledAmount", "type": "uint256" },
            { "name": "timestamp", "type": "uint256" },
            { "name": "expiration", "type": "uint256" },
            { "name": "status", "type": "uint8" },
            { "name": "rebookEnabled", "type": "bool" },
            { "name": "rebookAttempts", "type": "uint8" },
            { "name": "verificationId", "type": "bytes32" },
            { "name": "targetChainId", "type": "uint256" }
        ],
        "stateMutability": "view"
    }
];

const prov = new ethers.JsonRpcProvider(RPC_URL);
const iface = new ethers.Interface(ABI);
const contract = new ethers.Contract(PROCESSOR_ADDRESS, ABI, prov);

async function main() {
    try {
        console.log("Fetching receipt...");
        const receipt = await prov.getTransactionReceipt(TX_HASH);

        let orderId = null;
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
                if (parsed && parsed.name === 'OrderCreated') {
                    orderId = parsed.args[0];
                    console.log(`Found OrderId: ${orderId}`);
                    // console.log(`Maker: ${parsed.args[1]}`);
                    break;
                }
            } catch (e) { }
        }

        if (orderId) {
            console.log("\nQuerying contract for order details...");
            const order_info = await contract.orders(orderId);
            console.log(`Maker: ${order_info.maker}`);
            console.log(`TokenIn: ${order_info.tokenIn}`);
            console.log(`TokenOut: ${order_info.tokenOut}`);
            console.log(`AmountIn: ${order_info.amountIn.toString()}`);
            console.log(`AmountOut: ${order_info.amountOut.toString()}`);
            console.log(`Status: ${order_info.status} (0=ACTIVE)`);
            console.log(`Expiration: ${order_info.expiration.toString()}`);
            console.log(`TargetChainId: ${order_info.targetChainId.toString()}`);

            const now = Math.floor(Date.now() / 1000);
            console.log(`Local Time: ${now}`);
            console.log(`Is Expired? ${BigInt(order_info.expiration) < BigInt(now)}`);
        } else {
            console.log("OrderCreated event not found in logs");
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
