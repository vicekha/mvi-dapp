const { createPublicClient, http } = require('viem');
const { CONFIG } = require('./config');

async function debugChain(chainName) {
    const config = CONFIG[chainName];
    if (!config) return;

    console.log(`Debug Scanning ${chainName}...`);
    const client = createPublicClient({ transport: http(config.rpc) });

    const currentBlock = await client.getBlockNumber();
    // Scan last 10000 blocks
    const fromBlock = currentBlock - 10000n;

    console.log(`Fetching logs for ${config.OrderProcessor} from ${fromBlock} to ${currentBlock}`);

    try {
        const logs = await client.getLogs({
            address: config.OrderProcessor,
            fromBlock: fromBlock,
            toBlock: currentBlock
        });

        console.log(`Found ${logs.length} logs.`);
        if (logs.length > 0) {
            console.log("Sample Log Topics:", logs[0].topics);
            console.log("Sample Log Data:", logs[0].data);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

debugChain('sepolia');
debugChain('lasna');
