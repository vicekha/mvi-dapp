
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// New WalletSwapMain addresses
const SEPOLIA_WALLET_SWAP = '0xaAd187fB424D1114DCC7a2b83aAf38417cbF25Af';
const LASNA_WALLET_SWAP = '0x54c774b1B44Adde9C159dBA8e1fbBAeE18235283';

// Standard Reactive Network Callback Proxy
const CALLBACK_PROXY = '0x33Bb7E0a66922261a86934dB9398782CF36e897C';

// Existing contracts
const EXISTING = {
    SEPOLIA: {
        ORDER_PROCESSOR: '0xf211A240fDb3fB9a4fC24A3e72c1309AB115896F',
    },
    LASNA: {
        ORDER_PROCESSOR: '0xAD6D1F1C33785942BE18FE1498c35D10D4B0C50a',
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

function loadArtifact(contractName, fileName = null) {
    const fn = fileName || `${contractName}.sol`;
    const artifactPath = path.join(CONTRACTS_DIR, "out", fn, `${contractName}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    return artifact;
}

const WALLET_SWAP_ABI = [
    'function setAuthorizedReactiveVM(address _rvm) external',
    'function setCallbackProxy(address _proxy) external',
    'function owner() public view returns (address)',
    'function setWalletSwapMain(address _walletSwap) external'
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

    // Load RSC artifact (using SwapMatcherRSC2.0.sol filename)
    const rscArtifact = loadArtifact("SwapMatcherRSC", "SwapMatcherRSC2.0.sol");

    // Deploy RSC to Lasna
    console.log("\n=== Deploying SwapMatcherRSC 2.0 to LASNA ===");
    console.log(`  Owner: ${lasnaWallet.address}`);
    console.log(`  Sepolia WalletSwapMain: ${SEPOLIA_WALLET_SWAP}`);
    console.log(`  Lasna WalletSwapMain: ${LASNA_WALLET_SWAP}`);

    const rscFactory = new ethers.ContractFactory(rscArtifact.abi, rscArtifact.bytecode.object, lasnaWallet);
    const rsc = await rscFactory.deploy(
        lasnaWallet.address,      // _owner
        SEPOLIA_WALLET_SWAP,      // _sepoliaWalletSwapMain
        LASNA_WALLET_SWAP,        // _lasnaWalletSwapMain
        { gasLimit: 5000000, value: ethers.parseEther("0.1") } // Funding for subscriptions
    );
    await rsc.waitForDeployment();
    const rscAddress = await rsc.getAddress();
    console.log(`SwapMatcherRSC 2.0 deployed to: ${rscAddress}`);

    // Configure Sepolia WalletSwapMain
    console.log("\n=== Configuring Sepolia WalletSwapMain ===");
    const sepoliaWalletSwapContract = new ethers.Contract(SEPOLIA_WALLET_SWAP, WALLET_SWAP_ABI, sepoliaWallet);

    console.log("  Setting authorizedReactiveVM...");
    let tx = await sepoliaWalletSwapContract.setAuthorizedReactiveVM(rscAddress, { gasLimit: 100000 });
    await tx.wait();
    console.log("  authorizedReactiveVM set.");

    console.log("  Setting callbackProxy...");
    tx = await sepoliaWalletSwapContract.setCallbackProxy(CALLBACK_PROXY, { gasLimit: 100000 });
    await tx.wait();
    console.log("  callbackProxy set.");

    // Update Order Processor to point to new WalletSwapMain
    console.log("  Setting WalletSwapMain on OrderProcessor...");
    const sepoliaOrderProcessor = new ethers.Contract(EXISTING.SEPOLIA.ORDER_PROCESSOR, ORDER_PROCESSOR_ABI, sepoliaWallet);
    tx = await sepoliaOrderProcessor.setWalletSwapMain(SEPOLIA_WALLET_SWAP, { gasLimit: 100000 });
    await tx.wait();
    console.log("  OrderProcessor updated.");

    // Configure Lasna WalletSwapMain
    console.log("\n=== Configuring Lasna WalletSwapMain ===");
    const lasnaWalletSwapContract = new ethers.Contract(LASNA_WALLET_SWAP, WALLET_SWAP_ABI, lasnaWallet);

    console.log("  Setting authorizedReactiveVM...");
    tx = await lasnaWalletSwapContract.setAuthorizedReactiveVM(rscAddress, { gasLimit: 100000 });
    await tx.wait();
    console.log("  authorizedReactiveVM set.");

    console.log("  Setting callbackProxy...");
    tx = await lasnaWalletSwapContract.setCallbackProxy(CALLBACK_PROXY, { gasLimit: 100000 });
    await tx.wait();
    console.log("  callbackProxy set.");

    // Update Order Processor to point to new WalletSwapMain
    console.log("  Setting WalletSwapMain on OrderProcessor...");
    const lasnaOrderProcessor = new ethers.Contract(EXISTING.LASNA.ORDER_PROCESSOR, ORDER_PROCESSOR_ABI, lasnaWallet);
    tx = await lasnaOrderProcessor.setWalletSwapMain(LASNA_WALLET_SWAP, { gasLimit: 100000 });
    await tx.wait();
    console.log("  OrderProcessor updated.");

    console.log("\n=== CONFIGURATION COMPLETE ===");
    console.log("\nNew Contract Addresses:");
    console.log("========================");
    console.log(`SEPOLIA WALLET_SWAP_MAIN: '${SEPOLIA_WALLET_SWAP}'`);
    console.log(`LASNA WALLET_SWAP_MAIN: '${LASNA_WALLET_SWAP}'`);
    console.log(`SWAP_MATCHER_RSC: '${rscAddress}'`);
    console.log("\nUpdate frontend/src/config/contracts.ts with these addresses!");
}

main().catch(console.error);
