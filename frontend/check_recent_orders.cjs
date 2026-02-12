const { ethers } = require('ethers');

async function checkChain(name, rpc, processorAddress, walletAddress) {
    console.log(`\n=== Checking ${name} ===`);
    const provider = new ethers.JsonRpcProvider(rpc);

    const processorAbi = [
        "event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 targetChainId, uint256 timestamp)",
        "function orders(bytes32) external view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)",
        "event OrderCancelled(bytes32 indexed orderId, string reason, uint256 timestamp)"
    ];

    const walletAbi = [
        "event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp)",
        "event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp)"
    ];

    const processor = new ethers.Contract(processorAddress, processorAbi, provider);
    const wallet = new ethers.Contract(walletAddress, walletAbi, provider);

    try {
        const createdEvents = await processor.queryFilter(processor.filters.OrderCreated(), -200, 'latest');
        console.log(`Found ${createdEvents.length} OrderCreated events.`);

        for (const event of createdEvents) {
            const orderId = event.args[0];
            const details = await processor.orders(orderId);
            console.log(`Order ${orderId.slice(0, 10)}... Maker: ${details.maker.slice(0, 6)} Status: ${details.status}`);
        }

        const cancelEvents = await processor.queryFilter(processor.filters.OrderCancelled(), -200, 'latest');
        console.log(`Found ${cancelEvents.length} OrderCancelled events.`);
        for (const event of cancelEvents) {
            console.log(`Order ${event.args[0].slice(0, 10)}... Cancelled: ${event.args[1]}`);
        }

        const executedEvents = await wallet.queryFilter(wallet.filters.OrderExecuted(), -200, 'latest');
        console.log(`Found ${executedEvents.length} OrderExecuted events.`);

        const autoMatchedEvents = await wallet.queryFilter(wallet.filters.OrderAutoMatched(), -200, 'latest');
        console.log(`Found ${autoMatchedEvents.length} OrderAutoMatched events.`);

    } catch (e) {
        console.error(`Error checking ${name}:`, e.message);
    }
}

async function main() {
    await checkChain('Lasna', 'https://lasna-rpc.rnk.dev/', '0x39d3a9be32472fb944bddb6c21e33389698c5596', '0x26f39a1c4687645744d7e377f4738cda5164a254');
    await checkChain('Sepolia', 'https://ethereum-sepolia-rpc.publicnode.com', '0x3c85d9903327d6b2290ce8493e5e7e1f9c06f52d', '0xb8489abc7f5df9add04579bb74ec3c958d59ee21');
}

main();
