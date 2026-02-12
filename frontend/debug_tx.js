import { ethers } from 'ethers';

const RPC_URL = "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b";
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
        "type": "event",
        "name": "CrossChainOrderCreated",
        "inputs": [
            { "name": "orderId", "type": "bytes32", "indexed": true },
            { "name": "targetChainId", "type": "uint256", "indexed": false },
            { "name": "timestamp", "type": "uint256", "indexed": false }
        ],
        "anonymous": false
    }
];

const prov = new ethers.JsonRpcProvider(RPC_URL);
const iface = new ethers.Interface(ABI);

async function main() {
    try {
        console.log("Fetching receipt...");
        const receipt = await prov.getTransactionReceipt(TX_HASH);
        if (!receipt) {
            console.log("No receipt found");
            return;
        }
        console.log("Status:", receipt.status);
        console.log("Logs:", receipt.logs.length);

        receipt.logs.forEach((log, i) => {
            try {
                const parsed = iface.parseLog({
                    topics: [...log.topics],
                    data: log.data
                });
                if (parsed) {
                    console.log(`\nLog ${i} [${parsed.name}]:`);
                    // Convert BigInt to string for JSON.stringify
                    const args = {};
                    parsed.fragment.inputs.forEach((input, index) => {
                        let val = parsed.args[index];
                        if (typeof val === 'bigint') val = val.toString();
                        args[input.name] = val;
                    });
                    console.log(JSON.stringify(args, null, 2));
                }
            } catch (e) {
                // Ignore parsing errors for other events
                // console.log(`Log ${i} not parsed: ${e.message}`);
            }
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
