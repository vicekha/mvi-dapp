import { ethers } from "ethers";

// Configuration
const RPC_URL = "https://lasna-rpc.rnk.dev/";
const RSC_ADDRESS = "0x175b9aa1be6D625C6C9ee3DF2e5379B8D4ED6649";

// Chain IDs
const LASNA_CHAIN_ID = 5318007n;

// Tokens from Log #3
const TOKEN_IN_NFT = "0xe25d9F39F776e6D6EF0689282a9DDfDD1Ed00059";
const TOKEN_OUT_ETH = "0x0000000000000000000000000000000000000000";

const ABI = [
    "function orderBookByChain(uint256 chainId, address tokenIn, address tokenOut, uint256 index) view returns (bytes32 orderId, address maker, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 sourceChainId)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const rsc = new ethers.Contract(RSC_ADDRESS, ABI, provider);

    console.log(`Checking RSC State at ${RSC_ADDRESS}...`);

    console.log(`\n--- Looking for Order in Bucket: [Lasna] NFT -> ETH ---`);
    console.log(`TokenIn: ${TOKEN_IN_NFT}`);
    console.log(`TokenOut: ${TOKEN_OUT_ETH}`);

    await checkOrders(rsc, LASNA_CHAIN_ID, TOKEN_IN_NFT, TOKEN_OUT_ETH);

    console.log(`\n--- Looking for REVERSE Bucket: [Lasna] ETH -> NFT ---`);
    await checkOrders(rsc, LASNA_CHAIN_ID, TOKEN_OUT_ETH, TOKEN_IN_NFT);
}

async function checkOrders(rsc, chainId, tokenIn, tokenOut) {
    let index = 0;
    while (true) {
        try {
            const order = await rsc.orderBookByChain(chainId, tokenIn, tokenOut, index);
            console.log(`✅ Order Found at #${index}!`);
            console.log(`   ID: ${order.orderId}`);
            console.log(`   Maker: ${order.maker}`);
            console.log(`   Amts: ${ethers.formatEther(order.amountIn)} -> ${ethers.formatEther(order.amountOut)}`);
            index++;
        } catch (error) {
            if (index === 0) console.log("  No orders found in this bucket.");
            else console.log(`  End of list (Total: ${index})`);
            break;
        }
    }
}

main().catch(console.error);
