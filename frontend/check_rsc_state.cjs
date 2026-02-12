const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const rscAddress = '0x0908c48a7466f68e58808404738a60e6a263a8a9';

    const abi = [
        "function reactCount() view returns (uint256)",
        "function chainA() view returns (uint256)",
        "function chainB() view returns (uint256)",
        "function walletSwapA() view returns (address)",
        "function walletSwapB() view returns (address)",
        "function owner() view returns (address)",
        "function vm() view returns (bool)",
        "event ReactCalled(uint256 chainId, uint256 topic0, uint256 blockNumber)",
        "event OrderStored(bytes32 indexed orderId, uint256 chainId, address tokenIn, address tokenOut)",
        "event MatchFound(bytes32 indexed orderA, bytes32 indexed orderB, uint256 timestamp)"
    ];

    const rsc = new ethers.Contract(rscAddress, abi, provider);

    console.log('=== RSCv2 State Check ===');
    console.log('RSC Address:', rscAddress);

    try {
        console.log('React Count:', (await rsc.reactCount()).toString());
        console.log('Chain A (Sepolia):', (await rsc.chainA()).toString());
        console.log('Chain B (Lasna):', (await rsc.chainB()).toString());
        console.log('WalletSwap A:', await rsc.walletSwapA());
        console.log('WalletSwap B:', await rsc.walletSwapB());
        console.log('Owner:', await rsc.owner());
        console.log('VM Mode:', await rsc.vm());

        // Check for ReactCalled events
        console.log('\n=== ReactCalled Events ===');
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 500);
        const reactEvents = await rsc.queryFilter(rsc.filters.ReactCalled(), fromBlock, latestBlock);
        console.log(`Found ${reactEvents.length} ReactCalled events`);
        for (const event of reactEvents) {
            console.log(`- ChainId: ${event.args[0]}, Topic0: ${event.args[1].toString(16).slice(0, 10)}..., Block: ${event.args[2]}`);
        }

        // Check for OrderStored events
        console.log('\n=== OrderStored Events ===');
        const storedEvents = await rsc.queryFilter(rsc.filters.OrderStored(), fromBlock, latestBlock);
        console.log(`Found ${storedEvents.length} OrderStored events`);
        for (const event of storedEvents) {
            console.log(`- OrderId: ${event.args[0].slice(0, 10)}..., ChainId: ${event.args[1]}, TokenIn: ${event.args[2]}, TokenOut: ${event.args[3]}`);
        }

        // Check for MatchFound events
        console.log('\n=== MatchFound Events ===');
        const matchEvents = await rsc.queryFilter(rsc.filters.MatchFound(), fromBlock, latestBlock);
        console.log(`Found ${matchEvents.length} MatchFound events`);

    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
