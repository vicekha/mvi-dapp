const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const rscAddress = '0x677258049e084516428e2d65cc371f863be5246a';

    const abi = [
        "function chainA() view returns (uint256)",
        "function chainB() view returns (uint256)",
        "function walletSwapA() view returns (address)",
        "function walletSwapB() view returns (address)",
        "function owner() view returns (address)",
        "function initialized() view returns (bool)",
        "function getOrderCount(uint256 chainId, address tIn, address tOut) view returns (uint256)"
    ];

    const rsc = new ethers.Contract(rscAddress, abi, provider);

    console.log('=== RSC State Check ===');
    console.log('RSC Address:', rscAddress);

    try {
        const chainA = await rsc.chainA();
        const chainB = await rsc.chainB();
        const walletA = await rsc.walletSwapA();
        const walletB = await rsc.walletSwapB();
        const owner = await rsc.owner();
        const initialized = await rsc.initialized();

        console.log('Chain A (Sepolia):', chainA.toString());
        console.log('Chain B (Amoy):', chainB.toString());
        console.log('WalletSwap A (Sepolia):', walletA);
        console.log('WalletSwap B (Amoy):', walletB);
        console.log('Owner:', owner);
        console.log('Initialized:', initialized);

        // Check if there are any stored orders in the RSC
        // This would indicate that events ARE being received but not matched
        console.log('\n=== Stored Orders Check ===');
        // We need to check if there are orders, but we don't know the exact tokens
        // So we'll just log the function exists
        console.log('RSC has getOrderCount function - orders can be stored');

    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
