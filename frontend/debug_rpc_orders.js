import { ethers } from 'ethers';

// Configuration
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'; // Try public one
const ORDER_PROCESSOR = '0x7bcec9f6041f2aaa70510905f5bc36f101d9fa2c'; // Sepolia

const ABI = [
    'event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 targetChainId, uint256 timestamp)',
    'function orders(bytes32 orderId) external view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)'
];

async function main() {
    console.log(`Connecting to RPC: ${RPC_URL}`);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    try {
        const net = await provider.getNetwork();
        console.log(`Connected to network: ${net.name} (${net.chainId})`);
    } catch (e) {
        console.error("Failed to connect to RPC:", e.message);
        return;
    }

    const contract = new ethers.Contract(ORDER_PROCESSOR, ABI, provider);
    const filter = contract.filters.OrderCreated();

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    // Try a very small range first to test filter
    const fromBlock = currentBlock - 2000;
    const toBlock = currentBlock;
    console.log(`Querying logs from ${fromBlock} to ${toBlock}...`);

    try {
        const logs = await provider.getLogs({
            ...filter,
            fromBlock: fromBlock,
            toBlock: toBlock,
            address: ORDER_PROCESSOR
        });

        console.log(`Found ${logs.length} logs.`);

        if (logs.length > 0) {
            const log = logs[logs.length - 1]; // Last one
            console.log("Parsing last log...");
            const parsed = contract.interface.parseLog(log);
            console.log("Order ID:", parsed.args.orderId);

            console.log("Fetching order details...");
            const details = await contract.orders(parsed.args.orderId);
            console.log("Status:", details.status.toString());
        } else {
            console.log("No orders found in range. Try expanding range manually.");
        }

    } catch (e) {
        console.error("Log fetch failed:", e);
    }
}

main();
