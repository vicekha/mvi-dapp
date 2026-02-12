const { ethers } = require("ethers");

async function check() {
    const provider = new ethers.JsonRpcProvider("https://lasna-rpc.rnk.dev/");
    const usdcAddress = "0x5148c89235d7cf4462f169d6696d1767782f57f0";

    // ABI for decimals
    const abi = ["function decimals() view returns (uint8)", "function symbol() view returns (string)"];
    const contract = new ethers.Contract(usdcAddress, abi, provider);

    try {
        const decimals = await contract.decimals();
        const symbol = await contract.symbol();
        console.log(`Token: ${symbol} (${usdcAddress})`);
        console.log(`Decimals: ${decimals}`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}

check();
