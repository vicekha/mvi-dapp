const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');

    // New deployment addresses from 2026-01-27
    const walletSwapMainAddr = '0x1fd82a0cb28f46414f887ca610d3f753caf3de0b';
    const orderProcessorAddr = '0x98bd04bbfb691831e9a3117052b39eb416e95ff0';

    const wsmAbi = [
        "function orderProcessor() view returns (address)",
        "function feeDistributor() view returns (address)",
        "function assetVerifier() view returns (address)",
        "function liquidityPool() view returns (address)",
        "function authorizedReactiveVM() view returns (address)",
        "function callbackProxy() view returns (address)"
    ];

    const opAbi = [
        "function orderIds(uint256) view returns (bytes32)",
        "function orders(bytes32) view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)",
        "function ordersByPair(address,address,uint256) view returns (bytes32)",
        "function findMatchingOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut) view returns (bytes32)",
        "function walletSwapMain() view returns (address)"
    ];

    const wsm = new ethers.Contract(walletSwapMainAddr, wsmAbi, provider);
    const orderProcessor = new ethers.Contract(orderProcessorAddr, opAbi, provider);

    console.log('=== Lasna Contract Configuration Check ===\n');

    // Check WalletSwapMain config
    console.log('WalletSwapMain:', walletSwapMainAddr);
    try {
        const op = await wsm.orderProcessor();
        const fd = await wsm.feeDistributor();
        const av = await wsm.assetVerifier();
        const lp = await wsm.liquidityPool();
        const rvm = await wsm.authorizedReactiveVM();
        const proxy = await wsm.callbackProxy();

        console.log('  OrderProcessor:', op);
        console.log('  FeeDistributor:', fd);
        console.log('  AssetVerifier:', av);
        console.log('  LiquidityPool:', lp);
        console.log('  AuthorizedRVM:', rvm);
        console.log('  CallbackProxy:', proxy);
    } catch (e) {
        console.error('  Error reading WSM config:', e.message);
    }

    console.log('\n=== Order Processor State ===');

    // Check if OrderProcessor knows WalletSwapMain
    try {
        const wsmInOP = await orderProcessor.walletSwapMain();
        console.log('OrderProcessor.walletSwapMain:', wsmInOP);
        console.log('Matches WalletSwapMain?', wsmInOP.toLowerCase() === walletSwapMainAddr.toLowerCase());
    } catch (e) {
        console.error('Error reading walletSwapMain from OP:', e.message);
    }

    // Check orders
    console.log('\n=== Recent Orders ===');
    let orderCount = 0;
    for (let i = 0; i < 10; i++) {
        try {
            const orderId = await orderProcessor.orderIds(i);
            orderCount++;
            console.log(`Order ${i}: ${orderId.slice(0, 18)}...`);

            const order = await orderProcessor.orders(orderId);
            console.log(`  Maker: ${order.maker}`);
            console.log(`  TokenIn: ${order.tokenIn}`);
            console.log(`  TokenOut: ${order.tokenOut}`);
            console.log(`  AmountIn: ${ethers.formatEther(order.amountIn)}`);
            console.log(`  AmountOut: ${ethers.formatEther(order.amountOut)}`);
            console.log(`  Status: ${order.status} (0=ACTIVE, 1=FILLED, 2=PARTIAL, 3=CANCELLED, 4=EXPIRED)`);

            // Check if order is in ordersByPair
            try {
                const pairOrderId = await orderProcessor.ordersByPair(order.tokenIn, order.tokenOut, 0);
                console.log(`  In ordersByPair[${order.tokenIn.slice(0, 8)}...][${order.tokenOut.slice(0, 8)}...]: ${pairOrderId === orderId ? 'YES' : 'NO'}`);
            } catch (e) {
                console.log(`  ordersByPair check: empty or error`);
            }
        } catch (e) {
            // No more orders
            break;
        }
    }
    console.log(`\nTotal orders found: ${orderCount}`);

    // Test findMatchingOrder with common tokens
    console.log('\n=== Testing findMatchingOrder ===');
    const testToken = '0xBa117F0e0722c65690ed26609aD32FC97200F9f8'; // TEST
    const usdcToken = '0x8FFD65968891879a975bb776a5036Af1C10071B0'; // USDC

    try {
        const match = await orderProcessor.findMatchingOrder(testToken, usdcToken, ethers.parseEther('1'), ethers.parseEther('1'));
        console.log(`Match for TEST->USDC: ${match}`);
    } catch (e) {
        console.log('findMatchingOrder error:', e.message);
    }

    try {
        const match = await orderProcessor.findMatchingOrder(usdcToken, testToken, ethers.parseEther('1'), ethers.parseEther('1'));
        console.log(`Match for USDC->TEST: ${match}`);
    } catch (e) {
        console.log('findMatchingOrder error:', e.message);
    }
}

main().catch(console.error);
