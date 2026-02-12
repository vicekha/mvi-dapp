import { ethers } from "ethers";

const RPC_URL = "https://lasna-rpc.rnk.dev/";

// Contracts
const FEE_DISTRIBUTOR = "0x12d3f50694E8b5a0549f3f8b7bBa78011feAFfd7";
const WALLET_SWAP_MAIN = "0x6eb88ac084a0643BC20acad7C09170445D3ce535";
// The RSC address will be changing, so we'll check whatever authorization is set to
const EXPECTED_RSC = "0x175b9aa1be6D625C6C9ee3DF2e5379B8D4ED6649";

const ABI_FEE = [
    "function isReactiveContract(address) view returns (bool)"
];

const ABI_WALLET = [
    "function authorizedReactiveVM() view returns (address)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    console.log(`Checking Registration Status on Lasna...`);

    const feeDistributor = new ethers.Contract(FEE_DISTRIBUTOR, ABI_FEE, provider);
    const walletSwap = new ethers.Contract(WALLET_SWAP_MAIN, ABI_WALLET, provider);

    try {
        const isRegistered = await feeDistributor.isReactiveContract(WALLET_SWAP_MAIN);
        console.log(`1. Is WalletSwapMain registered in FeeDistributor? ${isRegistered ? "✅ YES" : "❌ NO"}`);
    } catch (e) {
        console.log("Error checking FeeDistributor:", e.message);
    }

    try {
        const authorizedRVM = await walletSwap.authorizedReactiveVM();
        console.log(`2. Authorized RSC in WalletSwapMain: ${authorizedRVM}`);
    } catch (e) {
        console.log("Error checking WalletSwapMain:", e.message);
    }
}

main().catch(console.error);
