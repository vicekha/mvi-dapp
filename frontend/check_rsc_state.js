import { ethers } from "ethers";

const TOKENS = {
    5318007: [
        { symbol: 'LREACT', address: '0x0000000000000000000000000000000000000000' },
        { symbol: 'TEST-NFT', address: '0xe25d9f39f776e6d6ef0689282a9ddfdd1ed00059' },
        { symbol: 'TEST', address: '0xba117f0e0722c65690ed26609ad32fc97200f9f8' },
        { symbol: 'USDC', address: '0x5148c89235d7cf4462f169d6696d1767782f57f0' }
    ],
    11155111: [
        { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000' },
        { symbol: 'TEST', address: '0x0384754fe5780cacafcfad6ebd383ae98e496e48' },
        { symbol: 'USDC', address: '0x8ffd65968891879a975bb776a5036af1c10071b0' },
        { symbol: 'MOCK-NFT', address: '0xf21243cfce9ce244e50455a2849013dfcd929797' }
    ]
};

const RPC_URL = "https://lasna-rpc.rnk.dev/";
const RSC_ADDRESS = "0x0d739147dEfb49CC204b79aC38330b697544C07a"; // The new RSC

// We need to inspect the 'orders' mapping.
// mapping(uint256 => mapping(address => mapping(address => Order[]))) public orders;
const RSC_ABI = [
    "function orders(uint256 chainId, address tokenIn, address tokenOut, uint256 index) external view returns (bytes32 orderId, address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 timestamp, uint256 chainId)",
    // We might need a way to know the length of the array, but public arrays usually don't expose a length getter for nested mappings easily in standard ABI unless generated.
    // However, ethers can try to call it. Usually public getter for array needs index.
    // To iterate, we try index 0, 1, ... until revert.
    "function chainA() external view returns (uint256)",
    "function chainB() external view returns (uint256)"
];

const SEPOLIA_CHAIN_ID = 11155111;
const LASNA_CHAIN_ID = 5318007;

// Helper to get token address for a chain
function getTokenAddr(chainId, symbol) {
    const t = TOKENS[chainId].find(x => x.symbol === symbol);
    return t ? t.address : ethers.ZeroAddress;
}

async function checkQueue(contract, chainId, tokenInSymbol, tokenOutSymbol) {
    const tokenIn = getTokenAddr(chainId, tokenInSymbol);
    const tokenOut = getTokenAddr(chainId, tokenOutSymbol);

    console.log(`\nChecking Queue [Chain ${chainId}]: Want ${tokenOutSymbol} -> Offer ${tokenInSymbol}`);
    console.log(`  Key: orders[${chainId}][${tokenIn}][${tokenOut}]`);
    // Wait, the RSC mapping is orders[remoteChainId][tokenIn][tokenOut]??
    // Let's re-read Step 697.
    // "Let's store by: chainId -> tokenIn -> tokenOut -> Order[]"
    // "If I have Order(In: A, Out: B), I look in storage[remoteChain][B][A]"
    // "Store this order: orders[log.chain_id][tokenIn][tokenOut].push(...)"

    // So if User on Sepolia (11155111) created Order(In: TEST, Out: USDC).
    // It is stored at orders[11155111][TEST][USDC].

    let index = 0;
    while (true) {
        try {
            const order = await contract.orders(chainId, tokenIn, tokenOut, index);
            console.log(`  [${index}] OrderID: ${order.orderId} | Maker: ${order.maker}`);
            console.log(`       AmountIn: ${ethers.formatEther(order.amountIn)} | AmountOut: ${ethers.formatEther(order.amountOut)}`);
            index++;
        } catch (e) {
            // End of array
            if (index === 0) console.log("  (Empty)");
            break;
        }
    }
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    console.log("Connected to Lasna");
    const contract = new ethers.Contract(RSC_ADDRESS, RSC_ABI, provider);

    const ca = await contract.chainA();
    const cb = await contract.chainB();
    console.log(`RSC Configured for Chains: ${ca} & ${cb}`);

    // Check Sepolia Orders (Pending matches on Lasna)
    // User sent TEST -> wanted USDC
    await checkQueue(contract, SEPOLIA_CHAIN_ID, "TEST", "USDC");

    // Check Lasna Orders (Pending matches on Sepolia)
    // Counterparty would send USDC -> want TEST
    await checkQueue(contract, LASNA_CHAIN_ID, "USDC", "TEST");
}

main().catch(console.error);
