const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    // Check recent OrderInitiated events on all chains
    const chains = [
        {
            name: 'Lasna',
            rpc: 'https://lasna-rpc.rnk.dev/',
            wsm: '0x26f39a1c4687645744d7e377f4738cda5164a254'
        },
        {
            name: 'Sepolia',
            rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
            wsm: '0xb8489abc7f5df9add04579bb74ec3c958d59ee21'
        }
    ];

    const abi = [
        "event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)"
    ];

    for (const chain of chains) {
        console.log(`\n=== ${chain.name} OrderInitiated Events ===`);
        const provider = new ethers.JsonRpcProvider(chain.rpc);
        const wsm = new ethers.Contract(chain.wsm, abi, provider);

        try {
            const filter = wsm.filters.OrderInitiated();
            const latestBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, latestBlock - 500);

            console.log(`Checking blocks ${fromBlock} to ${latestBlock}...`);
            const events = await wsm.queryFilter(filter, fromBlock, latestBlock);
            console.log(`Found ${events.length} OrderInitiated events`);

            for (const event of events.slice(-5)) {
                console.log('---');
                console.log(`OrderId: ${event.args[0]}`);
                console.log(`Maker: ${event.args[1]}`);
                console.log(`TokenIn: ${event.args[2]}`);
                console.log(`TokenOut: ${event.args[3]}`);
                console.log(`TargetChain: ${event.args[8]}`);
                console.log(`Block: ${event.blockNumber}`);
            }
        } catch (e) {
            console.error(`Error on ${chain.name}:`, e.message);
        }
    }

    // Also check RSC MatchFound events on Lasna
    console.log('\n=== RSC MatchFound Events ===');
    const lasnaProvider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const rscAbi = ["event MatchFound(bytes32 indexed orderA, bytes32 indexed orderB, uint256 timestamp)"];
    const rsc = new ethers.Contract('0x677258049e084516428e2d65cc371f863be5246a', rscAbi, lasnaProvider);

    try {
        const latestBlock = await lasnaProvider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 1000);
        const events = await rsc.queryFilter(rsc.filters.MatchFound(), fromBlock, latestBlock);
        console.log(`Found ${events.length} MatchFound events`);

        for (const event of events) {
            console.log(`Match: ${event.args[0].slice(0, 10)} <-> ${event.args[1].slice(0, 10)}`);
        }
    } catch (e) {
        console.error('Error checking RSC:', e.message);
    }
}

main();
