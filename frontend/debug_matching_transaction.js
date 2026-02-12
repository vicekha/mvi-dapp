import { ethers } from "ethers";

// Get transaction hash from command line
const txHash = process.argv[2];

if (!txHash) {
    console.log("Usage: node debug_matching_transaction.js <transaction_hash>");
    console.log("\nExample:");
    console.log("  node debug_matching_transaction.js 0x1234...");
    process.exit(1);
}

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// Try both networks
async function debugTransaction(rpc, networkName) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Checking ${networkName}...`);
    console.log('='.repeat(80));

    const provider = new ethers.JsonRpcProvider(rpc);

    try {
        const receipt = await provider.getTransactionReceipt(txHash);

        if (!receipt) {
            console.log(`❌ Transaction not found on ${networkName}`);
            return false;
        }

        console.log(`✅ Transaction found on ${networkName}!`);
        console.log(`\nBlock: ${receipt.blockNumber}`);
        console.log(`Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
        console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

        console.log(`\n📋 EVENTS EMITTED (${receipt.logs.length} total):`);
        console.log('─'.repeat(80));

        // Event signatures
        const ORDER_INITIATED = "0x058e802e2eed1657b621419f51940b8d60d9ff78dca249f39084606796695333";
        const MATCH_ATTEMPTED = "0x8e0d1e8c7c7e9c1d3a4b2f5e6d0c9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f";
        const ORDER_AUTO_MATCHED = ethers.id("OrderAutoMatched(bytes32,bytes32,uint256)");
        const ORDER_EXECUTED = ethers.id("OrderExecuted(bytes32,address,uint256,uint256)");

        let orderInitiated = false;
        let matchAttempted = false;
        let autoMatched = false;

        receipt.logs.forEach((log, idx) => {
            if (log.topics[0] === ORDER_INITIATED) {
                console.log(`\n${idx}. OrderInitiated Event ✅`);
                console.log(`   Order ID: ${log.topics[1]}`);
                orderInitiated = true;
            } else if (log.topics[0] === ORDER_AUTO_MATCHED) {
                console.log(`\n${idx}. OrderAutoMatched Event ✅✅ AUTO-MATCH SUCCESS!`);
                console.log(`   Order A: ${log.topics[1]}`);
                console.log(`   Order B: ${log.topics[2]}`);
                autoMatched = true;
            } else if (log.topics[0] === ORDER_EXECUTED) {
                console.log(`\n${idx}. OrderExecuted Event ✅`);
                console.log(`   Order ID: ${log.topics[1]}`);
            } else if (log.topics[0].includes("MatchAttempted")) {
                console.log(`\n${idx}. MatchAttempted Event 🔍`);
                matchAttempted = true;
            } else {
                console.log(`\n${idx}. Unknown Event: ${log.topics[0].substring(0, 10)}...`);
            }
        });

        console.log('\n' + '─'.repeat(80));
        console.log('DIAGNOSIS:');
        console.log('─'.repeat(80));

        if (autoMatched) {
            console.log('✅ AUTO-MATCHING WORKED! Order was instantly matched.');
        } else if (orderInitiated && !autoMatched) {
            console.log('⚠️  ORDER CREATED BUT NOT AUTO-MATCHED');
            console.log('\nPossible reasons:');
            console.log('1. No compatible order existed at creation time');
            console.log('2. Matching order expired before this transaction');
            console.log('3. Amounts were incompatible');
            console.log('4. Target chain IDs were incompatible');
            console.log('5. One of the orders has insufficient approvals');
            console.log('\n💡 Action: Check if a matching order exists now using OrdersPanel');
        } else {
            console.log('❓ Unexpected transaction structure');
        }

        return true;

    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log(`🔍 Debugging Transaction: ${txHash}\n`);

    const foundLasna = await debugTransaction(LASNA_RPC, "Lasna Testnet");
    const foundSepolia = await debugTransaction(SEPOLIA_RPC, "Sepolia Testnet");

    if (!foundLasna && !foundSepolia) {
        console.log("\n❌ Transaction not found on either network. Check the hash and try again.");
    }
}

main().catch(console.error);
