const { createPublicClient, http } = require('viem');
const { WalletSwapMainAbi, OrderProcessorAbi, CONFIG } = require('./config');
const { upsertOrder, getOrder } = require('./db');

// State to track last scanned block for each chain
let chainState = {
    sepolia: { lastBlock: CONFIG.sepolia.startBlock },
    polygonAmoy: { lastBlock: CONFIG.polygonAmoy.startBlock },
    lasna: { lastBlock: CONFIG.lasna.startBlock }
};

async function indexChain(chainName) {
    const config = CONFIG[chainName];
    const client = createPublicClient({
        transport: http(config.rpc)
    });

    try {
        const currentBlock = await client.getBlockNumber();
        const fromBlock = chainState[chainName].lastBlock;

        // Don't scan if we are ahead or up to date (simple check, refine for production)
        if (fromBlock >= currentBlock) return;

        // Scan in chunks of 2000 blocks to be safe
        const toBlock = (fromBlock + 2000n > currentBlock) ? currentBlock : fromBlock + 2000n;

        console.log(`Scanning ${chainName}: ${fromBlock} to ${toBlock}`);

        // 1. Fetch OrderCreated (OrderProcessor)
        const createdLogs = await client.getContractEvents({
            address: config.OrderProcessor,
            abi: OrderProcessorAbi,
            eventName: 'OrderCreated',
            fromBlock: fromBlock,
            toBlock: toBlock
        });

        for (const log of createdLogs) {
            const args = log.args;
            const order = {
                id: args.orderId,
                maker: args.maker,
                tokenIn: args.tokenIn,
                tokenOut: args.tokenOut,
                amountIn: args.amountIn.toString(),
                amountOut: args.amountOut.toString(),
                typeIn: Number(args.typeIn),
                typeOut: Number(args.typeOut),
                targetChainId: args.targetChainId.toString(),
                timestamp: args.timestamp.toString(),
                status: 0, // ACTIVE
                filledAmount: "0",
                chainId: config.id,
                txHash: log.transactionHash,
                expiration: (Number(args.timestamp) + 86400).toString() // Default fallback
            };

            // Fetch actual expiration from contract
            try {
                const orderData = await client.readContract({
                    address: config.OrderProcessor,
                    abi: OrderProcessorAbi,
                    functionName: 'orders',
                    args: [args.orderId]
                });
                // orderData is [maker, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, minutesValueIn, minutesValueOut, slippageTolerance, filledAmount, timestamp, expiration, status, rebookEnabled, rebookAttempts, verificationId, targetChainId]
                // Index 12 is expiration (based on struct in Solidity, verify order!)
                // Struct: maker, tokenIn, tokenOut, typeIn, typeOut, amountIn, amountOut, minutesValueIn, minutesValueOut, slippageTolerance, filledAmount, timestamp, expiration...
                // Yes, expiration is after timestamp.
                // But better to trust the returned object if it's named, or array index. Viem returns array or object depending on ABI. 
                // parseAbi usually implies array for struct components unless named. 
                // Let's assume array and use proper index or use a Safe fallback.
                if (orderData && orderData[12]) {
                    order.expiration = orderData[12].toString();
                }
            } catch (err) {
                console.warn(`Failed to fetch expiration for ${args.orderId}, using default`, err.message);
            }

            upsertOrder(order);
            console.log(`Indexed OrderCreated: ${args.orderId}`);
        }

        // 2. Fetch OrderFilled (OrderProcessor)
        const filledLogs = await client.getContractEvents({
            address: config.OrderProcessor,
            abi: OrderProcessorAbi,
            eventName: 'OrderFilled',
            fromBlock: fromBlock,
            toBlock: toBlock
        });

        for (const log of filledLogs) {
            upsertOrder({
                id: log.args.orderId,
                status: 1, // FILLED
                filledAmount: log.args.amountOut.toString()
            });
            console.log(`Indexed OrderFilled: ${log.args.orderId}`);
        }

        // 3. Fetch OrderCancelled (OrderProcessor)
        const cancelledLogs = await client.getContractEvents({
            address: config.OrderProcessor,
            abi: OrderProcessorAbi,
            eventName: 'OrderCancelled',
            fromBlock: fromBlock,
            toBlock: toBlock
        });

        for (const log of cancelledLogs) {
            upsertOrder({
                id: log.args.orderId,
                status: 3 // CANCELLED
            });
            console.log(`Indexed OrderCancelled: ${log.args.orderId}`);
        }

        // 4. Fetch OrderExecuted (WalletSwapMain) - for Partial Fills/Matches
        const executedLogs = await client.getContractEvents({
            address: config.WalletSwapMain,
            abi: WalletSwapMainAbi,
            eventName: 'OrderExecuted',
            fromBlock: fromBlock,
            toBlock: toBlock
        });

        for (const log of executedLogs) {
            // Update filledAmount
            const existing = getOrder(log.args.orderId);
            if (existing) {
                const currentFilled = BigInt(existing.filledAmount || 0);
                const newFilled = currentFilled + log.args.amountOut;
                const totalAmount = BigInt(existing.amountOut);

                // Determine status: 1 (Filled) or 2 (Partial)
                const isFilled = newFilled >= totalAmount;

                upsertOrder({
                    id: log.args.orderId,
                    filledAmount: newFilled.toString(),
                    status: isFilled ? 1 : 2
                });
                console.log(`Indexed OrderExecuted (Fill): ${log.args.orderId}`);
            }
        }

        // Update state
        chainState[chainName].lastBlock = toBlock + 1n;

    } catch (e) {
        console.error(`Error indexing ${chainName}:`, e.message);
    }
}

async function runIndexer() {
    console.log("Starting Indexer...");
    while (true) {
        await Promise.all([
            indexChain('sepolia'),
            // indexChain('polygonAmoy'), // Disabled by user request
            indexChain('lasna')
        ]);
        await new Promise(r => setTimeout(r, 5000)); // Sleep 5 seconds
    }
}

// If running directly
if (require.main === module) {
    runIndexer();
}

module.exports = { runIndexer };
