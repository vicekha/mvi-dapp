const { ethers } = require("ethers");

async function check() {
    const provider = new ethers.JsonRpcProvider("https://lasna-rpc.rnk.dev/");
    const walletSwapAddr = "0x28efb0be26e8f7ed21e7886dff29e754935868ca";
    const feeDistAddr = "0xaf582313095307a2da31be8b25ef2df28c81f823";
    const usdcAddr = "0x5148c89235d7cf4462f169d6696d1767782f57f0";
    const userAddr = "0xb133a194893434107925682789f16662fb9db062";

    const ownableAbi = ["function owner() view returns (address)"];
    const erc20Abi = [
        "function allowance(address, address) view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];

    try {
        // Check Ownership
        const walletSwap = new ethers.Contract(walletSwapAddr, ownableAbi, provider);
        const ownerWS = await walletSwap.owner();
        console.log(`WalletSwapMain Owner: ${ownerWS}`);
        console.log(`User matches WS Owner? ${ownerWS.toLowerCase() === userAddr.toLowerCase()}`);

        const feeDist = new ethers.Contract(feeDistAddr, ownableAbi, provider);
        const ownerFD = await feeDist.owner();
        console.log(`FeeDistributor Owner: ${ownerFD}`);
        console.log(`User matches FD Owner? ${ownerFD.toLowerCase() === userAddr.toLowerCase()}`);

        // Check USDC State
        const usdc = new ethers.Contract(usdcAddr, erc20Abi, provider);

        const balance = await usdc.balanceOf(userAddr);
        console.log(`User USDC Balance: ${balance.toString()}`);

        const allowance = await usdc.allowance(userAddr, walletSwapAddr);
        console.log(`User USDC Allowance to WalletSwap: ${allowance.toString()}`);

        // Fee Check (simulate 0.05%)
        const amount = 100n * 10n ** 18n;
        const fee = (amount * 5n) / 10000n;
        console.log(`Simulated Fee (0.05% of 100): ${fee.toString()}`);
        console.log(`Balance >= Amount + Fee? ${balance >= amount + fee ? "YES" : "NO"}`);
        console.log(`Allowance >= Amount + Fee? ${allowance >= amount + fee ? "YES" : "NO"}`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

check();
