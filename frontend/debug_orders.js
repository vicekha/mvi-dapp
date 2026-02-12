
import { ethers } from 'ethers';

// Config
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const LASNA_RPC = 'https://lasna-rpc.rnk.dev/';

const SEPOLIA_ORDER_PROCESSOR = '0x4324e1ee3f247f7ef6ad473296a5309cce22f961';
const LASNA_ORDER_PROCESSOR = '0x0009a96094225c3f51f1a5e4abc634e0fd5333b8';

const ABI = [
    'event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 targetChainId, uint256 timestamp)'
];

async function checkEvents(rpcUrl, address, name) {
    console.log(`Checking ${name} at ${address}...`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(address, ABI, provider);

    try {
        const block = await provider.getBlockNumber();
        console.log(`Current block: ${block}`);

        const filter = contract.filters.OrderCreated();
        // Query last 1000 blocks to be quicker/safer
        const startBlock = block - 1000 > 0 ? block - 1000 : 0;
        console.log(`Querying logs from ${startBlock} to latest...`);

        const logs = await contract.queryFilter(filter, startBlock, 'latest');

        console.log(`Found ${logs.length} OrderCreated events in last 1000 blocks.`);

        logs.forEach(log => {
            console.log(`- OrderId: ${log.args[0]}, Maker: ${log.args[1]}, TargetChain: ${log.args[9]}`);
        });

    } catch (e) {
        console.error(`Error checking ${name}:`, e);
    }
}

async function run() {
    await checkEvents(SEPOLIA_RPC, SEPOLIA_ORDER_PROCESSOR, 'Sepolia');
    // Lasna might be slower or different, keep it too
    await checkEvents(LASNA_RPC, LASNA_ORDER_PROCESSOR, 'Lasna');
}

run();
