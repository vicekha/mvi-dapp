const { ethers } = require("ethers");
require("dotenv").config({ path: "../contracts/.env" });

async function setFeeZero() {
    const rpcUrl = "https://lasna-rpc.rnk.dev/";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // User wallet from private key
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error("Error: PRIVATE_KEY not found in ../contracts/.env");
        process.exit(1);
    }
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Using wallet: ${wallet.address}`);

    // Addresses
    const feeDistAddr = "0xaf582313095307a2da31be8b25ef2df28c81f823";

    // ABI
    const abi = ["function setFeeRate(uint256 newRate) external", "function feeRate() view returns (uint256)"];
    const feeDistributor = new ethers.Contract(feeDistAddr, abi, wallet);

    try {
        const currentRate = await feeDistributor.feeRate();
        console.log(`Current Fee Rate: ${currentRate.toString()}`);

        if (currentRate.toString() === "0") {
            console.log("Fee Rate is already 0. No action needed.");
            return;
        }

        console.log("Setting Fee Rate to 0...");
        const tx = await feeDistributor.setFeeRate(0);
        console.log(`Transaction sent: ${tx.hash}`);
        await tx.wait();
        console.log("Fee Rate set to 0 successfully!");

    } catch (e) {
        console.error("Error:", e.message);
    }
}

setFeeZero();
