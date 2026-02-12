
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const CHAIN_ID_SEPOLIA = 11155111;
const CHAIN_ID_LASNA = 5318007;

const TRUST_WALLET_ADDRESS = "0x0dB12aAC15a63303d1363b8C862332C699Cca561";
const SYSTEM_SERVICE_ADDRESS = "0x0000000000000000000000000000000000fffFfF";

// Paths
const CONTRACTS_DIR = path.resolve(__dirname, "../contracts");
const ARTIFACTS_DIR = path.join(CONTRACTS_DIR, "out");
const ENV_PATH = path.join(CONTRACTS_DIR, ".env");
const LOG_FILE = path.join(__dirname, "deploy.log");

// --- Helpers ---

function log(msg) {
    console.log(msg);
    try {
        fs.appendFileSync(LOG_FILE, msg + "\n");
    } catch (e) { }
}

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        log(`Loading .env from ${ENV_PATH}`);
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
    } else {
        log("WARN: .env file not found at " + ENV_PATH);
    }
}

function getArtifact(name) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact for ${name} not found at ${artifactPath}`);
    }
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployContract(wallet, name, args = []) {
    log(`\nDeploying ${name}...`);
    const artifact = getArtifact(name);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);

    try {
        const overrides = {};
        const network = await wallet.provider.getNetwork();
        if (Number(network.chainId) === 11155111) { // Sepolia
            overrides.maxFeePerGas = ethers.parseUnits("30", "gwei"); // Aggressive
            overrides.maxPriorityFeePerGas = ethers.parseUnits("10", "gwei");
        }

        const contract = await factory.deploy(...args, overrides);
        log(`Transaction sent: ${contract.deploymentTransaction().hash}`);
        await contract.waitForDeployment();
        const address = await contract.getAddress();
        log(`${name} deployed at: ${address}`);
        return contract;
    } catch (error) {
        log(`Failed to deploy ${name}: ${error.message}`);
        throw error;
    }
}

// --- Main Script ---

async function main() {
    fs.writeFileSync(LOG_FILE, ""); // Clear log
    loadEnv();

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY not found in .env");
    }

    // Providers & Wallets
    const providerSepolia = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const providerLasna = new ethers.JsonRpcProvider(LASNA_RPC);

    const walletSepolia = new ethers.Wallet(privateKey, providerSepolia);
    const walletLasna = new ethers.Wallet(privateKey, providerLasna);

    log(`Deployer: ${walletLasna.address}`);
    log("Checking balances...");
    const balSepolia = await providerSepolia.getBalance(walletSepolia.address);
    const balLasna = await providerLasna.getBalance(walletLasna.address);
    log(`Sepolia Balance: ${ethers.formatEther(balSepolia)} ETH`);
    log(`Lasna Balance:   ${ethers.formatEther(balLasna)} ETH`);

    if (balLasna === 0n) throw new Error("Insufficient Lasna balance");

    // --- 1. Deploy Core Stack on Sepolia ---
    log("\n>>> STARTING SEPOLIA DEPLOYMENT <<<");
    const sepoliaPool = await deployContract(walletSepolia, "VirtualLiquidityPool");
    const sepoliaVerifier = await deployContract(walletSepolia, "AssetVerifier");
    const sepoliaFeeDistributor = await deployContract(walletSepolia, "TrustWalletFeeDistributor", [TRUST_WALLET_ADDRESS]);

    const sepoliaOrderProcessor = await deployContract(walletSepolia, "EulerLagrangeOrderProcessor", [
        await sepoliaPool.getAddress(),
        await sepoliaFeeDistributor.getAddress(),
        await sepoliaVerifier.getAddress()
    ]);

    const sepoliaWalletSwap = await deployContract(walletSepolia, "WalletSwapMain", [
        await sepoliaPool.getAddress(),
        await sepoliaOrderProcessor.getAddress(),
        await sepoliaFeeDistributor.getAddress(),
        await sepoliaVerifier.getAddress()
    ]);

    log("Configuring Sepolia contracts...");
    await (await sepoliaOrderProcessor.setWalletSwapMain(await sepoliaWalletSwap.getAddress())).wait();
    await (await sepoliaFeeDistributor.registerReactiveContract(await sepoliaWalletSwap.getAddress())).wait();
    log("Sepolia configuration complete.");

    // --- 2. Deploy Core Stack on Lasna ---
    log("\n>>> STARTING LASNA DEPLOYMENT <<<");
    const lasnaPool = await deployContract(walletLasna, "VirtualLiquidityPool");
    const lasnaVerifier = await deployContract(walletLasna, "AssetVerifier");
    const lasnaFeeDistributor = await deployContract(walletLasna, "TrustWalletFeeDistributor", [TRUST_WALLET_ADDRESS]);

    const lasnaOrderProcessor = await deployContract(walletLasna, "EulerLagrangeOrderProcessor", [
        await lasnaPool.getAddress(),
        await lasnaFeeDistributor.getAddress(),
        await lasnaVerifier.getAddress()
    ]);

    const lasnaWalletSwap = await deployContract(walletLasna, "WalletSwapMain", [
        await lasnaPool.getAddress(),
        await lasnaOrderProcessor.getAddress(),
        await lasnaFeeDistributor.getAddress(),
        await lasnaVerifier.getAddress()
    ]);

    log("Configuring Lasna contracts...");
    await (await lasnaOrderProcessor.setWalletSwapMain(await lasnaWalletSwap.getAddress())).wait();
    await (await lasnaFeeDistributor.registerReactiveContract(await lasnaWalletSwap.getAddress())).wait();
    log("Lasna configuration complete.");

    // --- 3. Deploy RSC on Lasna ---
    log("\n>>> DEPLOYING RSC (Lasna) <<<");
    const rsc = await deployContract(walletLasna, "SwapMatcherRSC", [
        SYSTEM_SERVICE_ADDRESS,
        CHAIN_ID_SEPOLIA,
        CHAIN_ID_LASNA,
        await sepoliaWalletSwap.getAddress(),
        await lasnaWalletSwap.getAddress()
    ]);

    log("Initializing RSC...");
    try {
        await (await rsc.initialize()).wait();
        log("RSC Initialized.");
    } catch (e) {
        log("RSC Initialization failed (might be already initialized?): " + e.message);
    }

    log("Manually Subscribing RSC to Events...");
    try {
        // Subscribe to Sepolia
        log("Subscribing to Sepolia events...");
        await (await rsc.manualSubscribe(CHAIN_ID_SEPOLIA, await sepoliaWalletSwap.getAddress())).wait();

        // Subscribe to Lasna
        log("Subscribing to Lasna events...");
        await (await rsc.manualSubscribe(CHAIN_ID_LASNA, await lasnaWalletSwap.getAddress())).wait();
        log("Subscriptions complete.");
    } catch (e) {
        log("Subscription failed: " + e.message);
    }

    // --- 4. Authorize RSC ---
    log("\n>>> AUTHORIZING RSC <<<");
    const rscAddress = await rsc.getAddress();

    log("Authorizing on Sepolia...");
    await (await sepoliaWalletSwap.setAuthorizedReactiveVM(rscAddress)).wait();
    log("Authorized on Sepolia.");

    log("Authorizing on Lasna...");
    await (await lasnaWalletSwap.setAuthorizedReactiveVM(rscAddress)).wait();
    log("Authorized on Lasna.");

    // --- Summary ---
    log("\n===========================================");
    log("       FULL DEPLOYMENT SUMMARY");
    log("===========================================");
    log("SEPOLIA:");
    log(`  WalletSwapMain: ${await sepoliaWalletSwap.getAddress()}`);
    log("LASNA:");
    log(`  WalletSwapMain: ${await lasnaWalletSwap.getAddress()}`);
    log(`  SwapMatcherRSC: ${rscAddress}`);
    log("===========================================");

    // Optional: Write to file
    const assignments = {
        VITE_SEPOLIA_WALLET_SWAP: await sepoliaWalletSwap.getAddress(),
        VITE_LASNA_WALLET_SWAP: await lasnaWalletSwap.getAddress(),
        VITE_RSC_ADDRESS: rscAddress
    };
    fs.writeFileSync("deployed_contracts.json", JSON.stringify(assignments, null, 2));
    log("Addresses saved to deployed_contracts.json");
}

main().catch((e) => log(e));
