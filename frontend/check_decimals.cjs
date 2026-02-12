
const { ethers } = require("ethers");

const RPC_URL = "https://lasna-rpc.rnk.dev/"; // Correct Lasna RPC from contracts.ts
const USDC_ADDRESS = "0x5148c89235d7cf4462f169d6696d1767782f57f0";

async function checkDecimals() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const abi = ["function decimals() view returns (uint8)"];
    const contract = new ethers.Contract(USDC_ADDRESS, abi, provider);

    try {
        const decimals = await contract.decimals();
        console.log(`USDC Decimals on Lasna: ${decimals}`);
        // Also check Symbol
        const abi2 = ["function symbol() view returns (string)"];
        const contract2 = new ethers.Contract(USDC_ADDRESS, abi2, provider);
        const symbol = await contract2.symbol();
        console.log(`Symbol: ${symbol}`);
    } catch (error) {
        console.error("Error fetching decimals:", error);
    }
}

checkDecimals();
