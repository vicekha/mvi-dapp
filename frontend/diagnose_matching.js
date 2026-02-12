import { ethers } from "ethers";

// Configuration
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const CONTRACTS = {
    lasna: {
        chainId: 5318007,
        WalletSwapMain: "0x7b14e97A1bf98F6673eA8617de430e2b8697B52c",
        OrderProcessor: "0x7863d9A976cdE792d788f6cf82B5a8bEdeE174E5"
    },
    sepolia: {
        chainId: 11155111,
        WalletSwapMain: "0x7135f0111a362a326d9eC3E790F026851872468C",
        OrderProcessor: "0xb8896C0EffAbE9B04DFFe705665F7C83c08EB9a5"
    }
};

const ABI = [
    "function orders(bytes32 orderId) external view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)",
    "function getOrderCount() external view returns (uint256)",
    "function orderIds(uint256) external view returns (bytes32)",
    "function findMatchingOrder(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut) external view returns (bytes32)",
    "event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)",
    "event MatchAttempted(bytes32 indexed orderId, address tokenIn, address tokenOut)",
    "event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp)"
];

const statusLabels = ["ACTIVE", "FILLED", "PARTIALLY_FILLED", "CANCELLED", "EXPIRED"];

async function checkOrders(chain, rpcUrl) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`CHECKING ${chain.toUpperCase()} TESTNET`);
    console.log('='.repeat(80));

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const config = CONTRACTS[chain];
    const orderProcessor = new ethers.Contract(config.OrderProcessor, ABI, provider);
    const walletSwap = new ethers.Contract(config.WalletSwapMain, ABI, provider);

    const count = await orderProcessor.getOrderCount();
    console.log(`\nTotal Orders: ${count}`);

    if (count === 0n) {
        console.log("No orders found.");
        return [];
    }

    const activeOrders = [];

    // Get last 10 orders
    const start = count > 10n ? count - 10n : 0n;
    console.log(`\nChecking orders ${start} to ${count - 1n}...`);

    for (let i = count - 1n; i >= start; i--) {
        try {
            const orderId = await orderProcessor.orderIds(i);
            const order = await orderProcessor.orders(orderId);

            const now = Math.floor(Date.now() / 1000);
            const isExpired = Number(order.expiration) < now;
            const isActive = order.status === 0 && !isExpired;

            console.log(`\n[${i}] Order ID: ${orderId.substring(0, 10)}...`);
            console.log(`  Maker: ${order.maker}`);
            console.log(`  Pair: ${getTokenSymbol(order.tokenIn, config.chainId)} → ${getTokenSymbol(order.tokenOut, Number(order.targetChainId) || config.chainId)}`);
            console.log(`  Amounts: ${ethers.formatEther(order.amountIn)} → ${ethers.formatEther(order.amountOut)}`);
            console.log(`  Status: ${statusLabels[order.status] || 'UNKNOWN'}`);
            console.log(`  TargetChain: ${order.targetChainId.toString()} ${order.targetChainId === 0n ? '(Any Chain)' : `(Chain ${order.targetChainId})`}`);
            console.log(`  Expired: ${isExpired ? 'YES ⚠️' : 'NO ✓'}`);

            if (isActive) {
                activeOrders.push({ orderId, order, index: i });
                console.log(`  ✅ ACTIVE - Available for matching`);

                // Try to find a match for this order
                try {
                    const matchId = await orderProcessor.findMatchingOrder(
                        order.tokenOut,  // What others want (our tokenOut)
                        order.tokenIn,   // What others offer (our tokenIn)
                        order.amountOut, // What we want
                        order.amountIn   // What we offer
                    );

                    if (matchId !== ethers.ZeroHash) {
                        console.log(`  🎯 MATCH FOUND: ${matchId.substring(0, 10)}...`);
                    }
                } catch (e) {
                    // Ignore matching errors
                }
            }

        } catch (e) {
            console.error(`Error fetching order ${i}:`, e.message);
        }
    }

    // Check for recent matching events
    console.log(`\n${'─'.repeat(80)}`);
    console.log("RECENT MATCHING EVENTS:");
    console.log('─'.repeat(80));

    try {
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = latestBlock - 1000; // Last ~1000 blocks

        const matchAttemptFilter = walletSwap.filters.MatchAttempted();
        const matchAttempts = await walletSwap.queryFilter(matchAttemptFilter, fromBlock);
        console.log(`\nMatch Attempts (last 1000 blocks): ${matchAttempts.length}`);

        const autoMatchFilter = walletSwap.filters.OrderAutoMatched();
        const autoMatches = await walletSwap.queryFilter(autoMatchFilter, fromBlock);
        console.log(`Successful Auto-Matches: ${autoMatches.length}`);

        if (autoMatches.length > 0) {
            console.log("\nRecent Auto-Matches:");
            autoMatches.slice(-5).forEach((event, idx) => {
                if (event.args) {
                    console.log(`  ${idx + 1}. Order ${event.args[0].substring(0, 10)}... ↔ ${event.args[1].substring(0, 10)}...`);
                }
            });
        }
    } catch (e) {
        console.log("Could not fetch events:", e.message);
    }

    return activeOrders;
}

function getTokenSymbol(address, chainId) {
    if (address === ethers.ZeroAddress) {
        return chainId === 5318007 ? 'LREACT' : 'ETH';
    }
    // Add your token mappings here
    const tokens = {
        '0xba117f0e0722c65690ed26609ad32fc97200f9f8': 'TEST',
        '0x5148c89235d7cf4462f169d6696d1767782f57f0': 'USDC',
        '0x0384754fe5780cacafcfad6ebd383ae98e496e48': 'TEST',
        '0x8ffd65968891879a975bb776a5036af1c10071b0': 'USDC',
    };
    return tokens[address.toLowerCase()] || address.substring(0, 6) + '...';
}

async function analyzeMatching() {
    console.log("\n🔍 AUTO-MATCHING DIAGNOSTIC TOOL 🔍\n");

    const lasnaOrders = await checkOrders('lasna', LASNA_RPC);
    const sepoliaOrders = await checkOrders('sepolia', SEPOLIA_RPC);

    console.log(`\n${'='.repeat(80)}`);
    console.log("ANALYSIS SUMMARY");
    console.log('='.repeat(80));
    console.log(`\nActive orders on Lasna: ${lasnaOrders.length}`);
    console.log(`Active orders on Sepolia: ${sepoliaOrders.length}`);

    console.log("\n⚠️  KEY INSIGHTS:");
    console.log("\n1. SAME-CHAIN AUTO-MATCHING:");
    console.log("   - Auto-matching ONLY works when targetChainId = 0 or = current chain");
    console.log("   - This happens INSTANTLY in createOrder() transaction");

    console.log("\n2. CROSS-CHAIN MATCHING:");
    console.log("   - Requires the SwapMatcherRSC to be subscribed to OrderInitiated events");
    console.log("   - RSC must be funded with REACT tokens for gas");
    console.log("   - RSC triggers callback to execute the match");

    console.log("\n3. WHY YOUR MATCH DIDN'T AUTO-EXECUTE:");
    console.log("   - If targetChainId != 0 and != current chain → needs RSC");
    console.log("   - If both orders target different chains → cannot match");
    console.log("   - If orders expired → cannot match");
    console.log("   - If RSC not subscribed → cross-chain won't work");

    console.log("\n📋 NEXT STEPS:");
    console.log("   1. Check targetChainId of your orders above");
    console.log("   2. Verify RSC subscription status (see below)");
    console.log("   3. Check RSC balance for gas");
    console.log("   4. Consider manual matching with matchOrders() function");
}

analyzeMatching().catch(console.error);
