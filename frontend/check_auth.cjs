const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');

    // New deployment addresses from latest deployment
    const walletSwapMainAddr = '0x2911b8ec84397f7d0b0bccfd7eb97af106fb283f';
    const orderProcessorAddr = '0x135e4a18970cf4ec35abebaedc3e508447493ae7';

    const opAbi = [
        "function walletSwapMain() view returns (address)",
        "function owner() view returns (address)"
    ];

    const orderProcessor = new ethers.Contract(orderProcessorAddr, opAbi, provider);

    console.log('=== Contract Authorization Check ===\n');

    try {
        const wsmInOP = await orderProcessor.walletSwapMain();
        const owner = await orderProcessor.owner();

        console.log('OrderProcessor.walletSwapMain():', wsmInOP);
        console.log('Expected WalletSwapMain:', walletSwapMainAddr);
        console.log('Match:', wsmInOP.toLowerCase() === walletSwapMainAddr.toLowerCase() ? '✓ AUTHORIZED' : '✗ NOT AUTHORIZED');
        console.log('');
        console.log('OrderProcessor.owner():', owner);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main().catch(console.error);
