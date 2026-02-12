
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// Contract addresses
const SEPOLIA_WALLET_SWAP = '0xaAd187fB424D1114DCC7a2b83aAf38417cbF25Af';
const LASNA_WALLET_SWAP = '0x54c774b1B44Adde9C159dBA8e1fbBAeE18235283';
const RSC_ADDRESS = '0x9828D175D2Ca61a5948510d02Ab92C2695542a1e';

// Callback Proxy - use ethers.getAddress to get correct checksum
const CALLBACK_PROXY = ethers.getAddress('0x33bb7e0a66922261a86934db9398782cf36e897c');

// Order Processors
const SEPOLIA_ORDER_PROCESSOR = '0xf211A240fDb3fB9a4fC24A3e72c1309AB115896F';
const LASNA_ORDER_PROCESSOR = '0xAD6D1F1C33785942BE18FE1498c35D10D4B0C50a';

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
];

const ORDER_PROCESSOR_ABI = [
    'function setWalletSwapMain(address _walletSwap) external'
];

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const lasnaProvider = new ethers.JsonRpcProvider(LASNA_RPC);
    const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);

    const lasnaWallet = new ethers.Wallet(privateKey, lasnaProvider);
    const sepoliaWallet = new ethers.Wallet(privateKey, sepoliaProvider);

    console.log(`Deployer: ${lasnaWallet.address}`);
    console.log(`Callback Proxy (checksummed): ${CALLBACK_PROXY}`);
    console.log(`RSC Address: ${RSC_ADDRESS}`);

    // Configure Sepolia WalletSwapMain
    console.log("\n=== Configuring Sepolia WalletSwapMain ===");
    const sepoliaWalletSwapContract = new ethers.Contract(SEPOLIA_WALLET_SWAP, WALLET_SWAP_ABI, sepoliaWallet);

    console.log("  Setting callbackProxy...");
    let tx = await sepoliaWalletSwapContract.setCallbackProxy(CALLBACK_PROXY, { gasLimit: 100000 });
    await tx.wait();
    console.log("  callbackProxy set.");

    // Update Sepolia Order Processor
    console.log("  Setting WalletSwapMain on Sepolia OrderProcessor...");
    const sepoliaOrderProcessor = new ethers.Contract(SEPOLIA_ORDER_PROCESSOR, ORDER_PROCESSOR_ABI, sepoliaWallet);
    tx = await sepoliaOrderProcessor.setWalletSwapMain(SEPOLIA_WALLET_SWAP, { gasLimit: 100000 });
    await tx.wait();
    console.log("  Sepolia OrderProcessor updated.");

    // Configure Lasna WalletSwapMain
    console.log("\n=== Configuring Lasna WalletSwapMain ===");
    const lasnaWalletSwapContract = new ethers.Contract(LASNA_WALLET_SWAP, WALLET_SWAP_ABI, lasnaWallet);

    console.log("  Setting authorizedReactiveVM...");
    tx = await lasnaWalletSwapContract.setAuthorizedReactiveVM(RSC_ADDRESS, { gasLimit: 100000 });
    await tx.wait();
    console.log("  authorizedReactiveVM set.");

    console.log("  Setting callbackProxy...");
    tx = await lasnaWalletSwapContract.setCallbackProxy(CALLBACK_PROXY, { gasLimit: 100000 });
    await tx.wait();
    console.log("  callbackProxy set.");

    // Update Lasna Order Processor
    console.log("  Setting WalletSwapMain on Lasna OrderProcessor...");
    const lasnaOrderProcessor = new ethers.Contract(LASNA_ORDER_PROCESSOR, ORDER_PROCESSOR_ABI, lasnaWallet);
    tx = await lasnaOrderProcessor.setWalletSwapMain(LASNA_WALLET_SWAP, { gasLimit: 100000 });
    await tx.wait();
    console.log("  Lasna OrderProcessor updated.");

    console.log("\n=== CONFIGURATION COMPLETE ===");
    console.log("\nNew Contract Addresses for frontend/src/config/contracts.ts:");
    console.log("==============================================================");
    console.log(`// Sepolia Testnet - Updated 2026-02-05`);
    console.log(`WALLET_SWAP_MAIN: '${SEPOLIA_WALLET_SWAP}',`);
    console.log(`\n// Lasna Testnet - Updated 2026-02-05`);
    console.log(`WALLET_SWAP_MAIN: '${LASNA_WALLET_SWAP}',`);
    console.log(`SWAP_MATCHER_RSC: '${RSC_ADDRESS}'`);
}

main().catch(console.error);
