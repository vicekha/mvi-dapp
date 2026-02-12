
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

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

async function deployContract(wallet, provider, artifact, constructorArgs = [], nonce) {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    const feeData = await provider.getFeeData();
    console.log(`  Nonce: ${nonce}, MaxFee: ${ethers.formatUnits(feeData.maxFeePerGas, 'gwei')} gwei`);

    const contract = await factory.deploy(...constructorArgs, {
        nonce: nonce,
        maxFeePerGas: feeData.maxFeePerGas * 2n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n
    });
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    console.log(`  Deployed to: ${address}`);
    return address;
}

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`\n=== Deploying to Base Sepolia ===`);
    console.log(`Deployer: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    let nonce = await provider.getTransactionCount(wallet.address, 'latest');
    console.log(`Starting nonce: ${nonce}`);

    // Load artifacts
    const vlpArtifact = loadArtifact("VirtualLiquidityPool");
    const fdArtifact = loadArtifact("TrustWalletFeeDistributor");
    const avArtifact = loadArtifact("AssetVerifier");
    const opArtifact = loadArtifact("EulerLagrangeOrderProcessor");
    const wsArtifact = loadArtifact("WalletSwapMain");

    console.log("\n1. Deploying VirtualLiquidityPool...");
    const vlpAddress = await deployContract(wallet, provider, vlpArtifact, [], nonce++);

    console.log("\n2. Deploying TrustWalletFeeDistributor...");
    const fdAddress = await deployContract(wallet, provider, fdArtifact, [wallet.address], nonce++);

    console.log("\n3. Deploying AssetVerifier...");
    const avAddress = await deployContract(wallet, provider, avArtifact, [], nonce++);

    console.log("\n4. Deploying EulerLagrangeOrderProcessor...");
    const opAddress = await deployContract(wallet, provider, opArtifact, [vlpAddress, fdAddress, avAddress], nonce++);

    console.log("\n5. Deploying WalletSwapMain...");
    const wsAddress = await deployContract(wallet, provider, wsArtifact, [vlpAddress, opAddress, fdAddress, avAddress], nonce++);

    // Configure OrderProcessor
    console.log("\n6. Configuring OrderProcessor...");
    const opAbi = ['function setWalletSwapMain(address _walletSwap) external'];
    const opContract = new ethers.Contract(opAddress, opAbi, wallet);
    const feeData = await provider.getFeeData();
    const tx = await opContract.setWalletSwapMain(wsAddress, {
        nonce: nonce++,
        maxFeePerGas: feeData.maxFeePerGas * 2n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n
    });
    await tx.wait();
    console.log("  OrderProcessor configured.");

    console.log("\n=== DEPLOYMENT COMPLETE ===");
    console.log("\n// For contracts.ts:");
    console.log(`84532: {`);
    console.log(`    WALLET_SWAP_MAIN: '${wsAddress}',`);
    console.log(`    ORDER_PROCESSOR: '${opAddress}',`);
    console.log(`    FEE_DISTRIBUTOR: '${fdAddress}',`);
    console.log(`    ASSET_VERIFIER: '${avAddress}',`);
    console.log(`    VIRTUAL_LIQUIDITY_POOL: '${vlpAddress}',`);
    console.log(`},`);
}

main().catch(console.error);
