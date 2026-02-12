import { ethers } from "ethers";
import * as fs from 'fs';

function log(msg) {
    console.log(msg);
    fs.appendFileSync("debug_log.txt", msg + "\n");
}

const RPC_URL = "https://lasna-rpc.rnk.dev/";
const TX_HASH = "0x4d33821ee60d6ddf44bc2fe70e1c84b49aa6f7fca03ee429958ceb098e972767"; // Lasna TX
const EXPECTED_PROCESSOR = "0xf21243cFcE9Ce244e50455a2849013DfCd929797"; // V13 Lasna OrderProcessor
const EXPECTED_TOPIC_0 = "0x54d85ef8201aba816135bce3c50a9e9853f0f63619b192e668d028a9fdaaa7ce"; // Correct V13 Hash

const ABI = [
    "event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 timestamp)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    log(`Fetching TX: ${TX_HASH}...`);

    const receipt = await provider.getTransactionReceipt(TX_HASH);
    if (!receipt) {
        log("Transaction not found or pending.");
        return;
    }

    log(`Status: ${receipt.status === 1 ? "Success" : "Failed"}`);

    // Clear previous log
    fs.writeFileSync("debug_log.txt", "");

    const iface = new ethers.Interface(ABI);

    receipt.logs.forEach((logEntry, index) => {
        log(`\nLog #${index}:`);
        log(`  Address: ${logEntry.address}`);
        log(`  Topic[0]: ${logEntry.topics[0]}`);

        // Check Address
        if (logEntry.address.toLowerCase() === EXPECTED_PROCESSOR.toLowerCase()) {
            log("  ✅ INFO: Emitter matches Expected OrderProcessor.");
        } else {
            log(`  ❌ WARNING: Emitter mismatch! Expected: ${EXPECTED_PROCESSOR}`);
        }

        // Check Topic
        if (logEntry.topics[0] === EXPECTED_TOPIC_0) {
            log("  ✅ INFO: Topic[0] matches V13 Hash.");
        } else {
            log(`  ❌ WARNING: Topic[0] mismatch!`);
            log(`     Found:    ${logEntry.topics[0]}`);
            log(`     Expected: ${EXPECTED_TOPIC_0}`);
        }

        try {
            const parsed = iface.parseLog(logEntry);
            if (parsed) {
                log("  Parsed Event: OrderCreated");
                log(`    OrderId: ${parsed.args.orderId}`);
                log(`    Maker: ${parsed.args.maker}`);
                log(`    TokenIn: ${parsed.args.tokenIn}`);
                log(`    TokenOut: ${parsed.args.tokenOut}`);
                log(`    AmountIn: ${ethers.formatEther(parsed.args.amountIn)}`);
                log(`    AmountOut: ${ethers.formatEther(parsed.args.amountOut)}`);
            }
        } catch (e) {
            log("  (Log not parsable with OrderCreated ABI - likely a different event)");
        }
    });
}

main().catch(console.error);
