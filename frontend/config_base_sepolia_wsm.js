
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

// Contract addresses
const BASE_SEPOLIA_WALLET_SWAP = '0x45FC261c74016d576d551Ea2f18daBEED0f7d079';
const RSC_ADDRESS = '0x2DE860c0b4447f46DaC2f003668f9AF2a37AfDcD';
const CALLBACK_PROXY = ethers.getAddress('0x33bb7e0a66922261a86934db9398782cf36e897c');

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

const WALLET_SWAP_ABI = [
    'function setAuthorizedReactiveVM(address _rvm) external',
    'function setCallbackProxy(address _proxy) external',
    'function authorizedReactiveVM() view returns (address)',
    'function callbackProxy() view returns (address)'
];

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Deployer: ${wallet.address}`);

    const walletSwap = new ethers.Contract(BASE_SEPOLIA_WALLET_SWAP, WALLET_SWAP_ABI, wallet);

    // Check current values
    console.log("\n=== Current Base Sepolia WalletSwapMain Configuration ===");
    try {
        const currentRVM = await walletSwap.authorizedReactiveVM();
        const currentProxy = await walletSwap.callbackProxy();
        console.log(`Current authorizedReactiveVM: ${currentRVM}`);
        console.log(`Current callbackProxy: ${currentProxy}`);

        if (currentRVM === RSC_ADDRESS && currentProxy === CALLBACK_PROXY) {
            console.log("\n✓ Already configured correctly!");
            return;
        }
    } catch (e) {
        console.log("Could not read current config:", e.message);
    }

    let nonce = await provider.getTransactionCount(wallet.address, 'latest');
    console.log(`\nStarting nonce: ${nonce}`);

    console.log("\n=== Configuring Base Sepolia WalletSwapMain ===");

    console.log("Setting authorizedReactiveVM...");
    let tx = await walletSwap.setAuthorizedReactiveVM(RSC_ADDRESS, { gasLimit: 100000, nonce: nonce++ });
    await tx.wait();
    console.log(`authorizedReactiveVM set. Tx: ${tx.hash}`);

    console.log("Setting callbackProxy...");
    tx = await walletSwap.setCallbackProxy(CALLBACK_PROXY, { gasLimit: 100000, nonce: nonce++ });
    await tx.wait();
    console.log(`callbackProxy set. Tx: ${tx.hash}`);

    console.log("\n=== CONFIGURATION COMPLETE ===");
}

main().catch(console.error);
