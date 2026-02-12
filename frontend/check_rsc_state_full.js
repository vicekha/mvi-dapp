import { ethers } from "ethers";

// Configuration
const RPC_URL = "https://lasna-rpc.rnk.dev/";
const RSC_ADDRESS = "0xEdE57B77BE7f8A920CC9B540Ff5DA578b5e53BE5";

// Chain IDs
const LASNA_CHAIN_ID = 5318007n;
const SEPOLIA_CHAIN_ID = 11155111n;

// Tokens (from contracts.ts)
const TOKENS = {
    LASNA: {
        LREACT: "0x0000000000000000000000000000000000000000",
        MOCK_NFT: "0xe25d9f39f776e6d6ef0689282a9ddfdd1ed00059"
    },
    SEPOLIA: {
        ETH: "0x0000000000000000000000000000000000000000",
        MOCK_NFT: "0x42b965ac6f70196d5fb9df8513e28ef4fe728ebd"
    }
};

const ABI = [
    "function orderBookByChain(uint256 chainId, address tokenIn, address tokenOut, uint256 index) view returns (bytes32 orderId, address maker, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 sourceChainId)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const rsc = new ethers.Contract(RSC_ADDRESS, ABI, provider);

    const balance = await provider.getBalance(RSC_ADDRESS);
    console.log(`Checking RSC State at ${RSC_ADDRESS}...`);
    console.log(`RSC Balance: ${ethers.formatEther(balance)} ETH`);

    // 1. Lasna: LREACT -> Sepolia ETH
    console.log(`\n--- [Lasna] LREACT -> ETH ---`);
    await checkOrders(rsc, LASNA_CHAIN_ID, TOKENS.LASNA.LREACT, TOKENS.LASNA.LREACT); // Note: TokenIn/Out handling depends on mapping key. Mapping is [chainId][tokenIn][tokenOut] usually.
    // Wait, mapping is: mapping(uint256 => mapping(address => mapping(address => Order[]))) public orderBookByChain;
    // Keys: chain_id (SOURCE chain), token_in, token_out.
    // So for Lasna Order (LREACT -> ETH): chain=Lasna, In=LREACT, Out=ETH (on dest chain? No, token addresses are usually local... wait)
    // In `react`: 
    // address tokenIn = address(uint160(topic_3));
    // abi.decode(data, (address tokenOut...))
    // orderBookByChain[chain_id][tokenIn][tokenOut].push(newOrder);

    // BUT tokenOut is on the *destination* chain. Does the order log contain the destination token address?
    // Yes, `tokenOut`.
    // On Lasna, `tokenOut` is likely `address(0)` (ETH) but that address exists on Lasna too.

    // Let's try likely pairs.

    // Lasna -> Sepolia (LREACT -> ETH)
    // tokenIn = LREACT (0x0...0), tokenOut = ETH (0x0...0)
    await checkOrders(rsc, LASNA_CHAIN_ID, TOKENS.LASNA.LREACT, TOKENS.SEPOLIA.ETH);

    // Sepolia -> Lasna (ETH -> LREACT)
    console.log(`\n--- [Sepolia] ETH -> LREACT ---`);
    await checkOrders(rsc, SEPOLIA_CHAIN_ID, TOKENS.SEPOLIA.ETH, TOKENS.LASNA.LREACT);
}

async function checkOrders(rsc, chainId, tokenIn, tokenOut) {
    let index = 0;
    while (true) {
        try {
            const order = await rsc.orderBookByChain(chainId, tokenIn, tokenOut, index);
            console.log(`Order #${index} [${order.sourceChainId}]: ${order.orderId}`);
            index++;
        } catch (error) {
            if (index === 0) console.log("  No orders found.");
            else console.log(`  Total: ${index}`);
            break;
        }
    }
}

main().catch(console.error);
