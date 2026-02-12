
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(__dirname, "../contracts/.env");
const BLOCKED_RPC = "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b";

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        const content = fs.readFileSync(ENV_PATH, "utf8");
        for (const line of content.split("\n")) {
            const match = line.match(/^\s*([\w]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || "";
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                process.env[key] = value;
            }
        }
    }
}

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("No private key");

    const provider = new ethers.JsonRpcProvider(BLOCKED_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Address: ${wallet.address}`);

    const latest = await wallet.getNonce("latest");
    const pending = await wallet.getNonce("pending");

    console.log(`Latest (Mined): ${latest}`);
    console.log(`Pending:        ${pending}`);

    if (pending <= latest) {
        console.log("No pending transactions to clear.");
        return;
    }

    console.log(`Clearing ${pending - latest} transactions (Nonce ${latest} to ${pending - 1})...`);

    for (let i = latest; i < pending; i++) {
        console.log(`Replacing nonce ${i}...`);
        try {
            const tx = await wallet.sendTransaction({
                to: wallet.address,
                value: 0,
                nonce: i,
                maxFeePerGas: ethers.parseUnits("50", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("20", "gwei")
            });
            console.log(`Sent replacement: ${tx.hash}`);
            await tx.wait();
            console.log(`Confirmed nonce ${i}`);
        } catch (e) {
            console.error(`Failed to clear nonce ${i}:`, e.message);
        }
    }
    console.log("Done.");
}

main().catch(console.error);
