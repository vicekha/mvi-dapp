
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// Contract Addresses form contracts.ts
// We wrap in getAddress to ensure checksum is valid
const SEPOLIA_WALLET_SWAP = '0xF23918fa9e055a4bFF928432a5D2d980CFA62fe4';
const LASNA_WALLET_SWAP = '0x1F80D729C41B5a7E33502CE41851aDcBDf1B4E87';
// Lowercase to allow ethers to compute checksum
const REACTIVE_CALLBACK_PROXY = '0x33bb7e0a66922261a86934db9398782cf36e897c';

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

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const providerSepolia = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const providerLasna = new ethers.JsonRpcProvider(LASNA_RPC);

    // Explicitly validate addresses
    const proxyAddr = ethers.getAddress(REACTIVE_CALLBACK_PROXY);
    const sepoliaAddr = ethers.getAddress(SEPOLIA_WALLET_SWAP);
    const lasnaAddr = ethers.getAddress(LASNA_WALLET_SWAP);

    console.log(`Proxy: ${proxyAddr}`);
    console.log(`Sepolia Contract: ${sepoliaAddr}`);
    console.log(`Lasna Contract: ${lasnaAddr}`);

    const walletSepolia = new ethers.Wallet(privateKey, providerSepolia);
    const walletLasna = new ethers.Wallet(privateKey, providerLasna);

    const ABI = ['function setCallbackProxy(address _proxy) external'];

    // Sepolia
    console.log(`\n--- Config Sepolia ---`);
    const contractSepolia = new ethers.Contract(sepoliaAddr, ABI, walletSepolia);
    try {
        const tx = await contractSepolia.setCallbackProxy(proxyAddr);
        console.log(`Sepolia Tx sent: ${tx.hash}`);
        await tx.wait();
        console.log("Sepolia Configured.");
    } catch (e) {
        console.error("Sepolia Failed:", e);
    }

    // Lasna
    console.log(`\n--- Config Lasna ---`);
    const contractLasna = new ethers.Contract(lasnaAddr, ABI, walletLasna);
    try {
        const tx = await contractLasna.setCallbackProxy(proxyAddr);
        console.log(`Lasna Tx sent: ${tx.hash}`);
        await tx.wait();
        console.log("Lasna Configured.");
    } catch (e) {
        console.error("Lasna Failed code:", e.code);
        console.error("Lasna Failed:", e);
    }
}

main().catch(console.error);
