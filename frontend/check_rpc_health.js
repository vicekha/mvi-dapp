import { ethers } from 'ethers';

const RPC_URL = 'https://lasna-rpc.rnk.dev/';
const CHECK_INTERVAL_MS = 10000; // Check every 10 seconds

async function checkRPCHealth() {
    try {
        const provider = new ethers.JsonRpcProvider(
            RPC_URL,
            { chainId: 5318007, name: 'lasna' },
            { staticNetwork: true }
        );

        // Try to get latest block number
        const blockNumber = await provider.getBlockNumber();

        console.log(`✅ RPC is HEALTHY - Latest block: ${blockNumber}`);
        return true;
    } catch (error) {
        console.log(`❌ RPC is DOWN - Error: ${error.message.substring(0, 100)}`);
        return false;
    }
}

async function continuousCheck() {
    console.log('🔍 Lasna RPC Health Monitor');
    console.log(`Checking ${RPC_URL} every ${CHECK_INTERVAL_MS / 1000} seconds...\n`);

    let wasHealthy = false;

    while (true) {
        const timestamp = new Date().toLocaleTimeString();
        process.stdout.write(`[${timestamp}] `);

        const isHealthy = await checkRPCHealth();

        // Alert when status changes
        if (!wasHealthy && isHealthy) {
            console.log('\n🎉 RPC IS BACK ONLINE! You can now deploy V7.\n');
        } else if (wasHealthy && !isHealthy) {
            console.log('\n⚠️  RPC went down.\n');
        }

        wasHealthy = isHealthy;

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
}

// Check if we should run once or continuously
const args = process.argv.slice(2);
if (args.includes('--once')) {
    checkRPCHealth().then(healthy => {
        process.exit(healthy ? 0 : 1);
    });
} else {
    continuousCheck();
}
