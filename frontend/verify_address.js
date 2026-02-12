import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
    const envPath = path.resolve("../contracts/.env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    let privateKey = "";
    for (const line of envContent.split("\n")) {
        if (line.match(/^PRIVATE_KEY=(.*)/)) {
            privateKey = line.match(/^PRIVATE_KEY=(.*)/)[1].trim();
        }
    }
    // Fix: Strip quotes if present
    privateKey = privateKey.replace(/['"]/g, '');

    if (!privateKey) throw new Error("Private key not find in .env");

    const provider = new ethers.JsonRpcProvider("https://lasna-rpc.rnk.dev/");
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Derived Address:", wallet.address);
    console.log("Expected Owner:", "0xb16662eb9db0624107925682789f1"); // Using the one found via cast call

    // Check if matches
    if (wallet.address.toLowerCase() === "0xb16662eb9db0624107925682789f1".toLowerCase()) {
        console.log("MATCH! We have the correct key.");
    } else {
        console.log("MISMATCH! parsing issue or wrong key.");
    }

    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
