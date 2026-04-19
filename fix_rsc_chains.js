const { ethers } = require("ethers");
require("dotenv").config({ path: "./contracts/.env" });

// ═══════════════════════════════════════════════════════════════════════
//  Addresses
// ═══════════════════════════════════════════════════════════════════════

const RSC_ADDRESS = "0x4Fc32F7a7b139F7cABc1C6088A1B55356992f2f1"; // MviSwapReactiveTestnet on Lasna

// STALE callback addresses (currently registered in the RSC)
const STALE = {
    sepolia:      "0x03B3bE6151F49FF5A0E7D1F3899f95A0EDB79A65",
    base_sepolia: "0x9c1aFEEBA9fc34f3dc2E8f768Ce99f00E2df3bEe"
};

// CORRECT callback addresses (from redeploy_full_result.json)
const CORRECT = {
    sepolia:      "0xbab1e1D2Cc51df7aDc40BDe248929b8E5652F114",
    base_sepolia: "0x33075a00670e48DE19fAFCEB42fF4CEdB3C18d35"
};

const CHAIN_IDS = {
    sepolia:      11155111,
    base_sepolia: 84532
};

const RPC_URLS = {
    lasna:        "https://lasna-rpc.rnk.dev/",
    sepolia:      "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b",
    base_sepolia: "https://base-sepolia-rpc.publicnode.com"
};

// ═══════════════════════════════════════════════════════════════════════
//  ABI fragments
// ═══════════════════════════════════════════════════════════════════════

const RSC_ABI = [
    "function removeChain(uint256 chainId) external",
    "function addChain(uint256 chainId, address walletSwap) external",
    "function chains(uint256) view returns (uint256 chainId, address walletSwap, bool active)",
    "function getRegisteredChains() view returns (uint256[])"
];

const CALLBACK_ABI = [
    "function setAuthorizedReactiveVM(address _rvm) external",
    "function rvm_id() view returns (address)"
];

// ═══════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) throw new Error("PRIVATE_KEY not set in .env");

    // ─── Step 1: Read current RSC state ──────────────────────────────
    console.log("\n═══ Step 1: Read current RSC chain config ═══");
    const lasnaProvider = new ethers.JsonRpcProvider(RPC_URLS.lasna);
    const lasnaWallet = new ethers.Wallet(pk, lasnaProvider);
    const rsc = new ethers.Contract(RSC_ADDRESS, RSC_ABI, lasnaWallet);

    const registeredChains = await rsc.getRegisteredChains();
    console.log("Registered chains:", registeredChains.map(c => c.toString()));

    for (const cid of registeredChains) {
        const cfg = await rsc.chains(cid);
        console.log(`  Chain ${cid}: walletSwap=${cfg.walletSwap}, active=${cfg.active}`);
    }

    // ─── Step 2: Remove stale chains from RSC ────────────────────────
    console.log("\n═══ Step 2: Remove stale chain entries ═══");

    for (const [name, chainId] of Object.entries(CHAIN_IDS)) {
        const cfg = await rsc.chains(chainId);
        if (cfg.active) {
            console.log(`Removing chain ${chainId} (${name}) → stale ${cfg.walletSwap}`);
            const tx = await rsc.removeChain(chainId);
            console.log(`  tx: ${tx.hash}`);
            await tx.wait();
            console.log(`  ✓ Removed`);
        } else {
            console.log(`Chain ${chainId} (${name}) already inactive, skipping remove`);
        }
    }

    // ─── Step 3: Add correct chains to RSC ───────────────────────────
    console.log("\n═══ Step 3: Add correct chain entries ═══");

    for (const [name, chainId] of Object.entries(CHAIN_IDS)) {
        const correctAddr = CORRECT[name];
        console.log(`Adding chain ${chainId} (${name}) → ${correctAddr}`);
        const tx = await rsc.addChain(chainId, correctAddr);
        console.log(`  tx: ${tx.hash}`);
        await tx.wait();
        console.log(`  ✓ Added`);
    }

    // ─── Step 4: Verify RSC state ────────────────────────────────────
    console.log("\n═══ Step 4: Verify RSC chain config ═══");
    const newChains = await rsc.getRegisteredChains();
    console.log("Registered chains:", newChains.map(c => c.toString()));
    for (const cid of newChains) {
        const cfg = await rsc.chains(cid);
        console.log(`  Chain ${cid}: walletSwap=${cfg.walletSwap}, active=${cfg.active}`);
    }

    // ─── Step 5: Set rvm_id on WalletSwapCallback contracts ──────────
    console.log("\n═══ Step 5: Set rvm_id on WalletSwapCallback contracts ═══");

    for (const [name, chainId] of Object.entries(CHAIN_IDS)) {
        const rpcUrl = RPC_URLS[name];
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(pk, provider);
        const callbackAddr = CORRECT[name];
        const callback = new ethers.Contract(callbackAddr, CALLBACK_ABI, wallet);

        // Check current rvm_id
        const currentRvm = await callback.rvm_id();
        console.log(`${name} (${callbackAddr}): current rvm_id = ${currentRvm}`);

        if (currentRvm.toLowerCase() !== RSC_ADDRESS.toLowerCase()) {
            console.log(`  Updating rvm_id to ${RSC_ADDRESS}...`);
            const tx = await callback.setAuthorizedReactiveVM(RSC_ADDRESS);
            console.log(`  tx: ${tx.hash}`);
            await tx.wait();
            console.log(`  ✓ Updated`);
        } else {
            console.log(`  ✓ Already correct`);
        }
    }

    console.log("\n═══ ALL DONE ═══");
    console.log("RSC:", RSC_ADDRESS);
    console.log("Sepolia callback:", CORRECT.sepolia);
    console.log("Base Sepolia callback:", CORRECT.base_sepolia);
}

main().catch(err => {
    console.error("FATAL:", err.message || err);
    process.exit(1);
});
