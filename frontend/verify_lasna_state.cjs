
const { ethers } = require("ethers");

const RPC_URL = "https://lasna-rpc.rnk.dev/";
const WALLET_SWAP_MAIN_ADDR = "0xa6c4c6ee68ac41c88c2981beb2c947627a66d680";
const FEE_DISTRIBUTOR_ADDR_CONFIG = "0x6c1c18fdc583b0e2c72fc409cf3350ef096561a0"; // From contracts.ts
const USDC_ADDR = "0x5148c89235d7cf4462f169d6696d1767782f57f0";

const WALLET_SWAP_ABI = [
    "function feeDistributor() view returns (address)",
    "function orderProcessor() view returns (address)"
];

const FEE_DISTRIBUTOR_ABI = [
    "function feeRate() view returns (uint256)",
    "function trustWalletAddresses(address) view returns (address)",
    "function defaultTrustWallet() view returns (address)"
];

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

async function verifyState() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    console.log(`\n=== VERIFYING STATE ===`);
    console.log(`WalletSwapMain Config: ${WALLET_SWAP_MAIN_ADDR}`);
    console.log(`FeeDistributor Config: ${FEE_DISTRIBUTOR_ADDR_CONFIG}`);

    // 1. Check WalletSwapMain linkage
    const walletSwap = new ethers.Contract(WALLET_SWAP_MAIN_ADDR, WALLET_SWAP_ABI, provider);

    let onChainFeeDistributor = "";
    try {
        onChainFeeDistributor = await walletSwap.feeDistributor();
        console.log(`\n[ON-CHAIN] WalletSwapMain.feeDistributor: ${onChainFeeDistributor}`);

        if (onChainFeeDistributor.toLowerCase() !== FEE_DISTRIBUTOR_ADDR_CONFIG.toLowerCase()) {
            console.error(">>> MISMATCH DETECTED! <<<");
            console.error(`Config: ${FEE_DISTRIBUTOR_ADDR_CONFIG}`);
            console.error(`Actual: ${onChainFeeDistributor}`);
        } else {
            console.log("FeeDistributor matches config.");
        }

    } catch (e) {
        console.error("Failed to read WalletSwapMain:", e.message);
    }

    // 2. Check Fee Rate from CONFIG distributor
    console.log(`\n[CONFIG] Checking FeeDistributor (${FEE_DISTRIBUTOR_ADDR_CONFIG})...`);
    const feeDistributorConfig = new ethers.Contract(FEE_DISTRIBUTOR_ADDR_CONFIG, FEE_DISTRIBUTOR_ABI, provider);
    try {
        const feeRateConfig = await feeDistributorConfig.feeRate();
        console.log(`Fee Rate (Config): ${feeRateConfig.toString()}`);
    } catch (e) { console.error(e.message); }

    // 3. Check Fee Rate from ACTUAL distributor (if different)
    if (onChainFeeDistributor && onChainFeeDistributor.toLowerCase() !== FEE_DISTRIBUTOR_ADDR_CONFIG.toLowerCase()) {
        console.log(`\n[ACTUAL] Checking FeeDistributor (${onChainFeeDistributor})...`);
        const feeDistributorActual = new ethers.Contract(onChainFeeDistributor, FEE_DISTRIBUTOR_ABI, provider);
        try {
            const feeRateActual = await feeDistributorActual.feeRate();
            console.log(`Fee Rate (Actual): ${feeRateActual.toString()}`);
            if (feeRateActual > 0) {
                console.log(">>> THIS IS THE CAUSE. Frontend calculates fee using Config, Contract uses Actual!");
            }
        } catch (e) { console.error(e.message); }
    }

    console.log("=== DONE ===\n");
}

verifyState();
