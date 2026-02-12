
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// Contract addresses
const RSC_ADDRESS = '0x887c19ba5BD1966a38486DaFE79C15d788354E7b';
const BASE_SEPOLIA_WSM = '0x45FC261c74016d576d551Ea2f18daBEED0f7d079';
const LASNA_WSM = '0x54c774b1B44Adde9C159dBA8e1fbBAeE18235283';

const BASE_SEPOLIA_CHAIN_ID = 84532;
const LASNA_CHAIN_ID = 5318007;

// OrderInitiated event signature
const ORDER_INITIATED_TOPIC = ethers.id('OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)');
const REACTIVE_IGNORE = '0x' + 'ff'.repeat(32);

const CONTRACTS_DIR = path.resolve(__dirname, "../contracts");
const ENV_PATH = path.join(CONTRACTS_DIR, ".env");

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        const content = fs.readFileSync(ENV_PATH, "utf8");
        for (const line of content.split("\n")) {
            const match = line.match(/^\s*([\w]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || "";
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
                process.env[key] = value;
            }
        }
    }
}

// System Contract ABI for subscribing
const SYSTEM_CONTRACT_ABI = [
    'function subscribe(uint256 _chain_id, address _contract, bytes32 topic_0, bytes32 topic_1, bytes32 topic_2, bytes32 topic_3) external payable'
];

const SYSTEM_CONTRACT_ADDR = '0x0000000000000000000000000000000000FFFFFF';

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const provider = new ethers.JsonRpcProvider(LASNA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`=== Manual RSC Subscription ===`);
    console.log(`Wallet: ${wallet.address}`);
    console.log(`RSC: ${RSC_ADDRESS}`);

    // We need to call subscribe FOR the RSC contract, but only the RSC contract can do that
    // Alternative: Check if RSC has a manual subscribe function

    // Let's check the RSC contract for subscribe methods
    const rscAbi = [
        'function manualSubscribe(uint256 chainId, address contractAddr) external',
        'function service() view returns (address)'
    ];
    const rsc = new ethers.Contract(RSC_ADDRESS, rscAbi, wallet);

    console.log('\nTrying to manually subscribe...');

    try {
        // Try calling manualSubscribe if it exists
        console.log('Attempting manualSubscribe for Base Sepolia...');
        let tx = await rsc.manualSubscribe(BASE_SEPOLIA_CHAIN_ID, BASE_SEPOLIA_WSM, { gasLimit: 500000 });
        await tx.wait();
        console.log('Base Sepolia subscription added!');

        console.log('Attempting manualSubscribe for Lasna...');
        tx = await rsc.manualSubscribe(LASNA_CHAIN_ID, LASNA_WSM, { gasLimit: 500000 });
        await tx.wait();
        console.log('Lasna subscription added!');
    } catch (e) {
        console.log('manualSubscribe failed (may not exist):', e.message.slice(0, 100));
        console.log('\n>>> RSC does not have manualSubscribe function.');
        console.log('>>> Need to REDEPLOY the RSC with correct subscription initialization.');
    }
}

main().catch(console.error);
