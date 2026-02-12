const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');

    const orderProcessorAddr = '0x39d3a9be32472fb944bddb6c21e33389698c5596';
    const walletSwapMainAddr = '0x26f39a1c4687645744d7e377f4738cda5164a254';

    const opAbi = [
        "function orderIds(uint256) view returns (bytes32)",
        "function orders(bytes32) view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)",
        "function ordersByPair(address,address,uint256) view returns (bytes32)",
        "function findMatchingOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut) view returns (bytes32)"
    ];

    const orderProcessor = new ethers.Contract(orderProcessorAddr, opAbi, provider);

    console.log('=== Lasna Order Processor State ===');

    // Check recent orders by iterating orderIds array
    try {
        console.log('\nRecent Orders:');
        for (let i = 0; i < 10; i++) {
            try {
                const orderId = await orderProcessor.orderIds(i);
                console.log(`Order ${i}: ${orderId.slice(0, 18)}...`);

                const order = await orderProcessor.orders(orderId);
                console.log(`  Maker: ${order.maker}`);
                console.log(`  TokenIn: ${order.tokenIn}`);
                console.log(`  TokenOut: ${order.tokenOut}`);
                console.log(`  AmountIn: ${order.amountIn.toString()}`);
                console.log(`  AmountOut: ${order.amountOut.toString()}`);
                console.log(`  Status: ${order.status} (0=ACTIVE, 1=FILLED)`);
                console.log(`  TargetChainId: ${order.targetChainId.toString()}`);
            } catch (e) {
                // No more orders
                console.log(`Total orders found: ${i}`);
                break;
            }
        }
    } catch (e) {
        console.error('Error fetching orders:', e.message);
    }

    // Test ordersByPair with test tokens
    console.log('\n=== Testing ordersByPair Mapping ===');
    const testToken = '0xBa117F0e0722c65690ed26609aD32FC97200F9f8'; // TEST token on Lasna
    const usdcToken = '0x8FFD65968891879a975bb776a5036Af1C10071B0'; // USDC on Lasna

    try {
        // Check if there are orders in ordersByPair[TEST][USDC]
        const orderId0 = await orderProcessor.ordersByPair(testToken, usdcToken, 0);
        console.log(`ordersByPair[TEST][USDC][0]: ${orderId0}`);
    } catch (e) {
        console.log('ordersByPair[TEST][USDC] is empty or error:', e.message);
    }

    try {
        // Check if there are orders in ordersByPair[USDC][TEST]
        const orderId0 = await orderProcessor.ordersByPair(usdcToken, testToken, 0);
        console.log(`ordersByPair[USDC][TEST][0]: ${orderId0}`);
    } catch (e) {
        console.log('ordersByPair[USDC][TEST] is empty or error:', e.message);
    }

    // Test findMatchingOrder
    console.log('\n=== Testing findMatchingOrder ===');
    try {
        // If we're offering TEST and want USDC, look for orders offering USDC wanting TEST
        const matchId = await orderProcessor.findMatchingOrder(testToken, usdcToken, ethers.parseEther('1'), ethers.parseEther('1'));
        console.log(`Match for TEST->USDC: ${matchId}`);
    } catch (e) {
        console.log('Error calling findMatchingOrder:', e.message);
    }
}

main();
