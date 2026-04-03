const { ethers } = require("ethers");
require("dotenv").config({ path: "./contracts/.env" });

async function main() {
    const rpcUrl = "https://lasna-rpc.rnk.dev/";
    const privateKey = process.env.PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const balance = await provider.getBalance(wallet.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "REACT");

    const target = "0x9C337B436A3880B1444329E4e7Ed1F2aBEC6b00D";
    const amount = ethers.parseEther("0.5");

    if (balance < amount) {
        console.error("Insufficient balance to fund contract");
        return;
    }

    console.log("Funding contract", target, "with 0.5 REACT...");
    const tx = await wallet.sendTransaction({
        to: target,
        value: amount
    });
    console.log("Transaction sent:", tx.hash);
    await tx.wait();
    console.log("Contract funded successfully!");
}

main().catch(console.error);
