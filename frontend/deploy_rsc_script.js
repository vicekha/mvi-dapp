import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
    // 1. Load Private Key from ../contracts/.env
    const envPath = path.resolve("../contracts/.env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    let privateKey = "";
    for (const line of envContent.split("\n")) {
        if (line.match(/^PRIVATE_KEY=(.*)/)) {
            privateKey = line.match(/^PRIVATE_KEY=(.*)/)[1].trim();
        }
    }
    if (!privateKey) throw new Error("Private key not find in .env");

    // 2. Load Bytecode and Args
    const bytecodePath = path.resolve("../contracts/bytecode.txt");
    const argsPath = path.resolve("../contracts/args.txt");

    // Helper to sanitize hex string
    const sanitizeHex = (str) => str.replace(/[^0-9a-fA-F]/g, "");

    let bytecode = fs.readFileSync(bytecodePath).toString('binary'); // Read binary to avoid encoding mess first
    // Actually, if it's UTF-16LE, we likely see null bytes. 
    // Let's just read as string and regex replace everything that is not hex.
    // Reading as utf-8 might produce weird chars from nulls. 
    // Better: read file buffer, convert format if needed, OR just regex.

    // Simplest: Read as utf-8, ignore errors, replace logic.
    const rawBytecode = fs.readFileSync(bytecodePath, "utf-8");
    bytecode = sanitizeHex(rawBytecode);

    const rawArgs = fs.readFileSync(argsPath, "utf-8");
    let args = sanitizeHex(rawArgs);

    let payload = "0x" + bytecode + args;

    console.log("Payload length:", payload.length);

    // 3. Setup Provider and Wallet
    const provider = new ethers.JsonRpcProvider("https://lasna-rpc.rnk.dev/");
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deployer:", wallet.address);
    const balance = await provider.getBalance(wallet.address);
    // Format appropriately
    console.log("Balance (wei):", balance.toString());
    console.log("Balance (eth):", ethers.formatEther(balance));

    if (balance === 0n) {
        throw new Error("Insufficient funds! Balance is 0.");
    }

    // 4. Send Deployment Transaction
    console.log("Sending deployment transaction (Force Gas Limit)...");
    const tx = await wallet.sendTransaction({
        data: payload,
        gasLimit: 5000000 // Force high gas limit
    });
    console.log("Tx Hash:", tx.hash);

    console.log("Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("Deployed! Contract Address:", receipt.contractAddress);

    // 5. Initialize RSC
    // rsc.initialize() -> selector 0x8129fc1c (assuming no args)
    // Actually, I should inspect ABI to be sure. 
    // But AbstractReactive.initialize() is consistent if not overridden with args.
    // SwapMatcherRSC.initialize() takes no args.

    // We can use a minimal ABI
    const abi = ["function initialize() external"];
    const contract = new ethers.Contract(receipt.contractAddress, abi, wallet);

    console.log("Initializing RSC...");
    const initTx = await contract.initialize();
    console.log("Init Tx Hash:", initTx.hash);
    await initTx.wait();
    console.log("RSC Initialized.");

    // Output address for next steps
    console.log("FINAL_RSC_ADDRESS=" + receipt.contractAddress);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
