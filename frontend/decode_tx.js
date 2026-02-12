const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    const txHash = '0xdaec92dec16ade45b80e65881a1e58204f21d46a806ce7ecf859c932e1706187';

    console.log('Fetching tx:', txHash);
    const tx = await provider.getTransaction(txHash);

    if (!tx) {
        console.log('Tx not found');
        return;
    }

    console.log('Input data length:', tx.data.length);

    const abi = [
        'function createOrder(address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId)'
    ];

    const iface = new ethers.Interface(abi);
    try {
        const decoded = iface.parseTransaction({ data: tx.data });
        console.log('Decoded args:');
        console.log('tokenIn:', decoded.args[0]);
        console.log('tokenOut:', decoded.args[1]);
        console.log('duration:', decoded.args[9].toString());
        console.log('slippage:', decoded.args[8].toString());
        console.log('targetChainId:', decoded.args[11].toString());
    } catch (e) {
        console.error('Decoding failed:', e);
    }
}

main();
