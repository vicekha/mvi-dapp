
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// Configuration
const CHAIN_ID_SEPOLIA = 11155111;
const CHAIN_ID_LASNA = 5318007;

const SEPOLIA_WALLET_SWAP = '0xF23918fa9e055a4bFF928432a5D2d980CFA62fe4';
const LASNA_WALLET_SWAP = '0x1F80D729C41B5a7E33502CE41851aDcBDf1B4E87';
const RSC_ADDRESS = '0x29E48291381A3cB6198648eC53E91D4664Da95E4';

const CONTRACTS_DIR = path.resolve(__dirname, "../contracts");
const ENV_PATH = path.join(CONTRACTS_DIR, ".env");

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        console.log(`Loading .env from ${ENV_PATH}`);
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

const ABI = [
    'function manualSubscribe(uint256 chainId, address contractAddr) external'
];

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    // RSC is deployed on Lasna
    const provider = new ethers.JsonRpcProvider(LASNA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Deployer: ${wallet.address}`);
    console.log(`RSC Address: ${RSC_ADDRESS}`);

    const rsc = new ethers.Contract(RSC_ADDRESS, ABI, wallet);

    // Subscribe to Sepolia
    console.log(`\nSubscribing to Sepolia (${CHAIN_ID_SEPOLIA}) events from ${SEPOLIA_WALLET_SWAP}...`);
    try {
        const tx1 = await rsc.manualSubscribe(CHAIN_ID_SEPOLIA, SEPOLIA_WALLET_SWAP, { gasLimit: 500000 });
        console.log(`Tx sent: ${tx1.hash}`);
        await tx1.wait();
        console.log("Sepolia subscription complete.");
    } catch (e) {
        console.error("Sepolia subscription failed:", e.message);
    }

    // Subscribe to Lasna
    console.log(`\nSubscribing to Lasna (${CHAIN_ID_LASNA}) events from ${LASNA_WALLET_SWAP}...`);
    try {
        const tx2 = await rsc.manualSubscribe(CHAIN_ID_LASNA, LASNA_WALLET_SWAP, { gasLimit: 500000 });
        console.log(`Tx sent: ${tx2.hash}`);
        await tx2.wait();
        console.log("Lasna subscription complete.");
    } catch (e) {
        console.error("Lasna subscription failed:", e.message);
    }

    console.log("\nDone.");
}

main().catch(console.error);
