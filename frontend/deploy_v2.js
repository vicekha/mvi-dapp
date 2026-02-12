
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// Existing contracts (don't redeploy these)
const EXISTING = {
    SEPOLIA: {
        VIRTUAL_LIQUIDITY_POOL: '0x7F61168Bfe18e8BC4B1f8c5f3A67acbe359B5B08',
        ORDER_PROCESSOR: '0xf211A240fDb3fB9a4fC24A3e72c1309AB115896F',
        FEE_DISTRIBUTOR: '0xf116d37099CD15593ea6b0Ad36Dff4582d9046cc',
        ASSET_VERIFIER: '0xFbDCcbfc44cDD29A113318c4b366C306a9C28a19',
    },
    LASNA: {
        VIRTUAL_LIQUIDITY_POOL: '0xc851d2650df6063ff407aAFF276C8E6197Cc92ad',
        ORDER_PROCESSOR: '0xAD6D1F1C33785942BE18FE1498c35D10D4B0C50a',
        FEE_DISTRIBUTOR: '0x9465b5251cb698cFd2B9C80365a21c6A09b1F0F7',
        ASSET_VERIFIER: '0xc8701de2F38E5f4e4Ba30DE9808DB7ED841da4CC',
    }
};

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

function loadArtifact(contractName) {
    const artifactPath = path.join(CONTRACTS_DIR, "out", `${contractName}.sol`, `${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    return artifact;
}

async function deployContract(wallet, artifact, args = []) {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    return await contract.getAddress();
}

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const lasnaProvider = new ethers.JsonRpcProvider(LASNA_RPC);

    const sepoliaWallet = new ethers.Wallet(privateKey, sepoliaProvider);
    const lasnaWallet = new ethers.Wallet(privateKey, lasnaProvider);

    console.log(`Deployer: ${sepoliaWallet.address}`);

    // Load artifacts
    const walletSwapArtifact = loadArtifact("WalletSwapMain");
    const rscArtifact = loadArtifact("SwapMatcherRSC"); // Using original name since 2.0 file has dot in name

    // Deploy WalletSwapMain to Sepolia
    console.log("\n=== Deploying to SEPOLIA ===");
    const sepoliaWalletSwap = await deployContract(sepoliaWallet, walletSwapArtifact, [
        EXISTING.SEPOLIA.VIRTUAL_LIQUIDITY_POOL,
        EXISTING.SEPOLIA.ORDER_PROCESSOR,
        EXISTING.SEPOLIA.FEE_DISTRIBUTOR,
        EXISTING.SEPOLIA.ASSET_VERIFIER
    ]);
    console.log(`WalletSwapMain deployed to: ${sepoliaWalletSwap}`);

    // Deploy WalletSwapMain to Lasna
    console.log("\n=== Deploying to LASNA ===");
    const lasnaWalletSwap = await deployContract(lasnaWallet, walletSwapArtifact, [
        EXISTING.LASNA.VIRTUAL_LIQUIDITY_POOL,
        EXISTING.LASNA.ORDER_PROCESSOR,
        EXISTING.LASNA.FEE_DISTRIBUTOR,
        EXISTING.LASNA.ASSET_VERIFIER
    ]);
    console.log(`WalletSwapMain deployed to: ${lasnaWalletSwap}`);

    console.log("\n=== DEPLOYMENT COMPLETE ===");
    console.log("SEPOLIA:");
    console.log(`  WALLET_SWAP_MAIN: '${sepoliaWalletSwap}'`);
    console.log("LASNA:");
    console.log(`  WALLET_SWAP_MAIN: '${lasnaWalletSwap}'`);

    console.log("\nNext steps:");
    console.log("1. Deploy SwapMatcherRSC2.0 to Lasna with these addresses");
    console.log("2. Authorize RSC and set callbackProxy on both WalletSwapMain contracts");
    console.log("3. Update frontend/src/config/contracts.ts");
}

main().catch(console.error);
