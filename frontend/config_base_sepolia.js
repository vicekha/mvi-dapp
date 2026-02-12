
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

// Deployed contracts
const BASE_SEPOLIA = {
    VIRTUAL_LIQUIDITY_POOL: '0xEEE05b494273FbE175b6F5da84eB0155DbC9f4F6',
    FEE_DISTRIBUTOR: '0xe49BF54e744495B30AbAaFEd715127713FCFACEf',
    ASSET_VERIFIER: '0x5D0eEb9838e2c5A0623CFD7f99b003D8F76d55e2',
    ORDER_PROCESSOR: '0xc8d5A7a7Ae89291aa34fb9F04f630899565fCAf2',
    WALLET_SWAP_MAIN: '0x45FC261c74016d576d551Ea2f18daBEED0f7d079'
};

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

function loadArtifact(contractName) {
    const artifactPath = path.join(CONTRACTS_DIR, "out", `${contractName}.sol`, `${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    return artifact;
}

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Deployer: ${wallet.address}`);

    // Load OrderProcessor artifact for full ABI
    const opArtifact = loadArtifact("EulerLagrangeOrderProcessor");
    const opContract = new ethers.Contract(BASE_SEPOLIA.ORDER_PROCESSOR, opArtifact.abi, wallet);

    console.log("\nConfiguring OrderProcessor.setWalletSwapMain...");

    try {
        const tx = await opContract.setWalletSwapMain(BASE_SEPOLIA.WALLET_SWAP_MAIN, { gasLimit: 100000 });
        console.log(`Tx: ${tx.hash}`);
        await tx.wait();
        console.log("Configuration successful!");
    } catch (e) {
        console.error("Failed:", e.message);

        // Check if already configured
        try {
            const currentWsm = await opContract.walletSwapMain();
            console.log(`Current WalletSwapMain in OrderProcessor: ${currentWsm}`);
        } catch (e2) {
            console.log("Could not read walletSwapMain");
        }
    }

    console.log("\nDone!");
}

main().catch(console.error);
