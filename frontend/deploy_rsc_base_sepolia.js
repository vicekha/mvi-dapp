
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// Base Sepolia WalletSwapMain
const BASE_SEPOLIA_WALLET_SWAP = '0x45FC261c74016d576d551Ea2f18daBEED0f7d079';
// Lasna WalletSwapMain
const LASNA_WALLET_SWAP = '0x54c774b1B44Adde9C159dBA8e1fbBAeE18235283';
// Callback Proxy
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

function loadArtifact(contractName, fileName = null) {
    const fn = fileName || `${contractName}.sol`;
    const artifactPath = path.join(CONTRACTS_DIR, "out", fn, `${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    return artifact;
}

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const provider = new ethers.JsonRpcProvider(LASNA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`\n=== Deploying SwapMatcherRSC (Base Sepolia + Lasna) to Lasna ===`);
    console.log(`Deployer: ${wallet.address}`);
    console.log(`Base Sepolia WalletSwapMain: ${BASE_SEPOLIA_WALLET_SWAP}`);
    console.log(`Lasna WalletSwapMain: ${LASNA_WALLET_SWAP}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    // Load RSC artifact (using SwapMatcherRSC2.0.sol filename)
    const rscArtifact = loadArtifact("SwapMatcherRSC", "SwapMatcherRSC2.0.sol");

    console.log("\nDeploying SwapMatcherRSC...");
    const rscFactory = new ethers.ContractFactory(rscArtifact.abi, rscArtifact.bytecode.object, wallet);
    const rsc = await rscFactory.deploy(
        wallet.address,               // _owner
        BASE_SEPOLIA_WALLET_SWAP,     // _baseSepoliaWalletSwapMain
        LASNA_WALLET_SWAP,            // _lasnaWalletSwapMain
        { gasLimit: 5000000, value: ethers.parseEther("0.5") } // Funding for subscriptions
    );
    await rsc.waitForDeployment();
    const rscAddress = await rsc.getAddress();
    console.log(`SwapMatcherRSC deployed to: ${rscAddress}`);

    // Call coverDebt
    console.log("\nCalling coverDebt...");
    const rscAbi2 = ['function coverDebt() external', 'function subscribeAll() external payable'];
    const rscContract = new ethers.Contract(rscAddress, rscAbi2, wallet);
    await (await rscContract.coverDebt({ gasLimit: 500000 })).wait();
    console.log("coverDebt successful!");

    // Call subscribeAll to manually create subscriptions
    console.log("\nCalling subscribeAll (manual subscription)...");
    await (await rscContract.subscribeAll({ gasLimit: 1000000, value: ethers.parseEther("0.1") })).wait();
    console.log("subscribeAll successful!");

    // Configure Base Sepolia WalletSwapMain
    console.log("\n=== Now configure Base Sepolia WalletSwapMain ===");
    console.log(`Run the following commands or use a script to set:`);
    console.log(`  authorizedReactiveVM: ${rscAddress}`);
    console.log(`  callbackProxy: ${CALLBACK_PROXY}`);

    console.log("\n=== DEPLOYMENT COMPLETE ===");
    console.log(`\nRSC Address: ${rscAddress}`);
    console.log("\nUpdate contracts.ts with:");
    console.log(`SWAP_MATCHER_RSC: '${rscAddress}'`);
}

main().catch(console.error);
