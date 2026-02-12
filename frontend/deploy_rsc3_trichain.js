/**
 * RSC 3.0 Tri-Chain Deployment Script
 * Deploys SwapMatcherRSC3_TriChain to Lasna for cross-chain swaps across:
 * - Lasna (5318007)
 * - Sepolia (11155111)
 * - Base Sepolia (84532)
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ Configuration ============

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

const CHAIN_ID_LASNA = 5318007;
const CHAIN_ID_SEPOLIA = 11155111;
const CHAIN_ID_BASE_SEPOLIA = 84532;

// Existing WalletSwapMain addresses from contracts.ts
const WALLET_SWAP_MAIN = {
    [CHAIN_ID_LASNA]: "0x54c774b1B44Adde9C159dBA8e1fbBAeE18235283",
    [CHAIN_ID_SEPOLIA]: "0xaAd187fB424D1114DCC7a2b83aAf38417cbF25Af",
    [CHAIN_ID_BASE_SEPOLIA]: "0x45FC261c74016d576d551Ea2f18daBEED0f7d079"
};

const CONTRACTS_DIR = path.resolve(__dirname, "../contracts");
const ARTIFACTS_DIR = path.join(CONTRACTS_DIR, "out");
const ENV_PATH = path.join(CONTRACTS_DIR, ".env");
const LOG_FILE = path.join(__dirname, "rsc3_trichain_deploy.log");

// ============ Helpers ============

function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(LOG_FILE, line + "\n");
    } catch (e) { }
}

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        log(`Loading .env from ${ENV_PATH}`);
        const content = fs.readFileSync(ENV_PATH, "utf8");
        // Split by both \r\n and \n to handle Windows/Unix line endings
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue; // Skip empty lines and comments
            const match = line.match(/^([\w]+)\s*=\s*(.*)$/);
            if (match) {
                const key = match[1];
                let value = (match[2] || "").trim();
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[key] = value;
            }
        }
    } else {
        throw new Error(".env file not found at " + ENV_PATH);
    }
}

function getArtifact(name) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact for ${name} not found at ${artifactPath}. Run 'forge build' first.`);
    }
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

// ============ Main Deployment ============

async function main() {
    fs.writeFileSync(LOG_FILE, ""); // Clear log
    log("=== RSC 3.0 TRI-CHAIN DEPLOYMENT ===");
    log("");

    loadEnv();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY not found in .env");
    }

    // Setup providers
    const providerLasna = new ethers.JsonRpcProvider(LASNA_RPC);
    const providerSepolia = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const providerBaseSepolia = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);

    const walletLasna = new ethers.Wallet(privateKey, providerLasna);
    const walletSepolia = new ethers.Wallet(privateKey, providerSepolia);
    const walletBaseSepolia = new ethers.Wallet(privateKey, providerBaseSepolia);

    log(`Deployer: ${walletLasna.address}`);
    log("");

    // Check balances
    log("Checking balances...");
    const balLasna = await providerLasna.getBalance(walletLasna.address);
    const balSepolia = await providerSepolia.getBalance(walletSepolia.address);
    const balBaseSepolia = await providerBaseSepolia.getBalance(walletBaseSepolia.address);

    log(`  Lasna:        ${ethers.formatEther(balLasna)} ETH`);
    log(`  Sepolia:      ${ethers.formatEther(balSepolia)} ETH`);
    log(`  Base Sepolia: ${ethers.formatEther(balBaseSepolia)} ETH`);
    log("");

    if (balLasna < ethers.parseEther("0.5")) {
        throw new Error("Insufficient Lasna balance (need at least 0.5 ETH for deployment + gas)");
    }

    // Load artifact
    log("Loading SwapMatcherRSC3_TriChain artifact...");
    const artifact = getArtifact("SwapMatcherRSC3_TriChain");

    // Deploy RSC to Lasna
    log("");
    log(">>> DEPLOYING RSC 3.0 TRI-CHAIN TO LASNA <<<");
    log("");

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, walletLasna);

    const deployValue = ethers.parseEther("0.3"); // Fund RSC with 0.3 ETH for callbacks

    log("Constructor parameters:");
    log(`  _owner: ${walletLasna.address}`);
    log(`  _sepoliaWalletSwapMain: ${WALLET_SWAP_MAIN[CHAIN_ID_SEPOLIA]}`);
    log(`  _baseSepoliaWalletSwapMain: ${WALLET_SWAP_MAIN[CHAIN_ID_BASE_SEPOLIA]}`);
    log(`  _lasnaWalletSwapMain: ${WALLET_SWAP_MAIN[CHAIN_ID_LASNA]}`);
    log(`  Initial funding: ${ethers.formatEther(deployValue)} ETH`);
    log("");

    const rsc = await factory.deploy(
        walletLasna.address,
        WALLET_SWAP_MAIN[CHAIN_ID_SEPOLIA],
        WALLET_SWAP_MAIN[CHAIN_ID_BASE_SEPOLIA],
        WALLET_SWAP_MAIN[CHAIN_ID_LASNA],
        { value: deployValue }
    );

    log(`Transaction sent: ${rsc.deploymentTransaction().hash}`);
    await rsc.waitForDeployment();
    const rscAddress = await rsc.getAddress();
    log(`SwapMatcherRSC3_TriChain deployed at: ${rscAddress}`);
    log("");

    // Authorize RSC on all chains
    log(">>> AUTHORIZING RSC ON ALL CHAINS <<<");
    log("");

    const walletSwapABI = [
        "function setAuthorizedReactiveVM(address rvm) external",
        "function authorizedReactiveVM() external view returns (address)"
    ];

    // Authorize on Sepolia
    log("Authorizing on Sepolia...");
    const sepoliaWalletSwap = new ethers.Contract(WALLET_SWAP_MAIN[CHAIN_ID_SEPOLIA], walletSwapABI, walletSepolia);
    const txSepolia = await sepoliaWalletSwap.setAuthorizedReactiveVM(rscAddress, {
        maxFeePerGas: ethers.parseUnits("30", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("10", "gwei")
    });
    await txSepolia.wait();
    log(`  Tx: ${txSepolia.hash}`);

    // Authorize on Base Sepolia
    log("Authorizing on Base Sepolia...");
    const baseSepoliaWalletSwap = new ethers.Contract(WALLET_SWAP_MAIN[CHAIN_ID_BASE_SEPOLIA], walletSwapABI, walletBaseSepolia);
    const txBaseSepolia = await baseSepoliaWalletSwap.setAuthorizedReactiveVM(rscAddress);
    await txBaseSepolia.wait();
    log(`  Tx: ${txBaseSepolia.hash}`);

    // Authorize on Lasna
    log("Authorizing on Lasna...");
    const lasnaWalletSwap = new ethers.Contract(WALLET_SWAP_MAIN[CHAIN_ID_LASNA], walletSwapABI, walletLasna);
    const txLasna = await lasnaWalletSwap.setAuthorizedReactiveVM(rscAddress);
    await txLasna.wait();
    log(`  Tx: ${txLasna.hash}`);

    log("");

    // Summary
    log("===========================================");
    log("   RSC 3.0 TRI-CHAIN DEPLOYMENT COMPLETE");
    log("===========================================");
    log("");
    log("RSC Address: " + rscAddress);
    log("");
    log("Monitored Chains:");
    log(`  Sepolia (${CHAIN_ID_SEPOLIA}):      ${WALLET_SWAP_MAIN[CHAIN_ID_SEPOLIA]}`);
    log(`  Base Sepolia (${CHAIN_ID_BASE_SEPOLIA}): ${WALLET_SWAP_MAIN[CHAIN_ID_BASE_SEPOLIA]}`);
    log(`  Lasna (${CHAIN_ID_LASNA}):        ${WALLET_SWAP_MAIN[CHAIN_ID_LASNA]}`);
    log("");
    log("ReactScan: https://lasna.reactscan.net/address/" + rscAddress);
    log("===========================================");

    // Save to file
    const output = {
        RSC_ADDRESS: rscAddress,
        SEPOLIA_WALLET_SWAP: WALLET_SWAP_MAIN[CHAIN_ID_SEPOLIA],
        BASE_SEPOLIA_WALLET_SWAP: WALLET_SWAP_MAIN[CHAIN_ID_BASE_SEPOLIA],
        LASNA_WALLET_SWAP: WALLET_SWAP_MAIN[CHAIN_ID_LASNA],
        DEPLOYED_AT: new Date().toISOString()
    };

    fs.writeFileSync("rsc3_trichain_deployed.json", JSON.stringify(output, null, 2));
    log("Addresses saved to rsc3_trichain_deployed.json");
}

main().catch((e) => {
    log("ERROR: " + e.message);
    console.error(e);
    process.exit(1);
});
