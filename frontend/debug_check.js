const { ethers } = require("ethers");

async function main() {
    const rpc = "https://ethereum-sepolia-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(rpc);

    const user = "0xB133a194893434107925682789F16662FB9DB062"; // User from logs
    const walletSwapAddress = "0xbd6e6ab5a4e51a02316e5a27b6cebf26594843a0"; // Latest deployed
    const tokenAddress = "0x0384754fe5780cacafcfad6ebd383ae98e496e48"; // 'TEST' token from log
    const feeDistributorAddress = "0xa9b26a40d13568882350c9ed1b8b99e54515466e"; // Latest deployed

    // ABI
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address, address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)"
    ];

    const walletSwapAbi = [
        "function feeDistributor() view returns (address)",
        "function calculateFee(address token, uint8 typeIn, uint256 amount, uint256 minutesVal) view returns (uint256)" // Actually on feeDistributor but accessed via contract? No, feeDistributor is pub var.
    ];

    const feeDistributorAbi = [
        "function calculateFee(address token, uint8 typeIn, uint256 amount, uint256 minutesVal) view returns (uint256)"
    ]

    const token = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const walletSwap = new ethers.Contract(walletSwapAddress, walletSwapAbi, provider);

    console.log(`Checking state for User: ${user}`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`WalletSwap (Spender): ${walletSwapAddress}`);

    try {
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        const balance = await token.balanceOf(user);
        const allowance = await token.allowance(user, walletSwapAddress);

        console.log(`Token: ${symbol} (${decimals} decimals)`);
        console.log(`User Balance: ${ethers.formatUnits(balance, decimals)} (${balance})`);
        console.log(`Allowance to WalletSwap: ${ethers.formatUnits(allowance, decimals)} (${allowance})`);

        // Check feeDistributor link
        const onChainFeeDist = await walletSwap.feeDistributor();
        console.log(`WalletSwap.feeDistributor(): ${onChainFeeDist}`);
        console.log(`Expected FeeDistributor:     ${feeDistributorAddress}`);

        if (onChainFeeDist.toLowerCase() !== feeDistributorAddress.toLowerCase()) {
            console.error("MISMATCH! WalletSwap is pointing to WRONG FeeDistributor!");
        } else {
            console.log("FeeDistributor address matches.");
        }

        // Simulate Fee Calculation (rough estimate)
        // Assume sending 100 tokens
        // const amount = ethers.parseUnits("100", decimals);
        // const feeContract = new ethers.Contract(onChainFeeDist, feeDistributorAbi, provider);
        // // AssetType 0 = ERC20
        // const fee = await feeContract.calculateFee(tokenAddress, 0, amount, amount); 
        // console.log(`Fee for 100 tokens: ${ethers.formatUnits(fee, decimals)}`);

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
