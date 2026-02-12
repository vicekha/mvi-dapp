
const { ethers } = require("ethers");

const RPC_URL = "https://lasna-rpc.rnk.dev/";
const WALLET_SWAP_MAIN_ADDR = "0xa6c4c6ee68ac41c88c2981beb2c947627a66d680";
const FEE_DISTRIBUTOR_ADDR = "0x6c1c18fdc583b0e2c72fc409cf3350ef096561a0";

const OWNABLE_ABI = [
    "function owner() view returns (address)"
];

async function checkOwnership() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    console.log(`Checking ownership...`);

    // Check FeeDistributor
    const feeDistributor = new ethers.Contract(FEE_DISTRIBUTOR_ADDR, OWNABLE_ABI, provider);
    try {
        const owner = await feeDistributor.owner();
        console.log(`FeeDistributor Owner: ${owner}`);
    } catch (e) {
        console.error("FeeDistributor owner check failed:", e.message);
    }

    // Check WalletSwapMain
    const walletSwap = new ethers.Contract(WALLET_SWAP_MAIN_ADDR, OWNABLE_ABI, provider);
    try {
        const owner = await walletSwap.owner();
        console.log(`WalletSwapMain Owner:   ${owner}`);
    } catch (e) {
        console.error("WalletSwapMain owner check failed:", e.message);
    }
}

checkOwnership();
