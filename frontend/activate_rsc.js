
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// RSC Address
const RSC_ADDRESS = '0x9828D175D2Ca61a5948510d02Ab92C2695542a1e';

const CONTRACTS_DIR = path.resolve(__dirname, "../contracts");
const ENV_PATH = path.join(CONTRACTS_DIR, ".env");

function loadEnv() {
    if (fs.existsSync(ENV_PATH)) {
        const content = fs.readFileSync(ENV_PATH, "utf8");
        for (const line of content.split("\n")) {
            const match = line.match(/^\s*([\w]+)\s*=\s*(.*)?\s*$/);
            if (match) {
                const key = match[1];
                let value = match[2] || "";
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
                process.env[key] = value;
            }
        }
    }
}

// AbstractPayer ABI for coverDebt
const RSC_ABI = [
    'function coverDebt() external',
    'function debt() external view returns (uint256)',
    'receive() external payable'
];

async function main() {
    loadEnv();
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not found");

    const provider = new ethers.JsonRpcProvider(LASNA_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`Deployer: ${wallet.address}`);
    console.log(`RSC Address: ${RSC_ADDRESS}`);

    // Check RSC balance
    const rscBalance = await provider.getBalance(RSC_ADDRESS);
    console.log(`\nRSC Balance: ${ethers.formatEther(rscBalance)} ETH`);

    const rsc = new ethers.Contract(RSC_ADDRESS, RSC_ABI, wallet);

    // Check current debt
    try {
        const debt = await rsc.debt();
        console.log(`Current Debt: ${ethers.formatEther(debt)} ETH`);
    } catch (e) {
        console.log(`Could not read debt: ${e.message}`);
    }

    // Fund RSC if needed
    const fundAmount = ethers.parseEther("0.5");
    if (rscBalance < fundAmount) {
        console.log(`\nFunding RSC with 0.5 ETH...`);
        const fundTx = await wallet.sendTransaction({
            to: RSC_ADDRESS,
            value: fundAmount,
            gasLimit: 100000
        });
        await fundTx.wait();
        console.log(`Funded RSC. Tx: ${fundTx.hash}`);
    } else {
        console.log(`RSC already has sufficient balance: ${ethers.formatEther(rscBalance)} ETH`);
    }

    // Call coverDebt on RSC itself
    console.log(`\nCalling coverDebt() on RSC...`);
    try {
        const tx = await rsc.coverDebt({ gasLimit: 500000 });
        console.log(`coverDebt tx sent: ${tx.hash}`);
        await tx.wait();
        console.log(`coverDebt successful!`);
    } catch (e) {
        console.error(`coverDebt failed:`, e.message);
        console.log(`\nTrying with value...`);
        try {
            const tx = await rsc.coverDebt({ gasLimit: 500000, value: ethers.parseEther("0.2") });
            console.log(`coverDebt with value tx sent: ${tx.hash}`);
            await tx.wait();
            console.log(`coverDebt with value successful!`);
        } catch (e2) {
            console.error(`coverDebt with value also failed:`, e2.message);
        }
    }

    // Check new balance and debt
    const newBalance = await provider.getBalance(RSC_ADDRESS);
    console.log(`\nUpdated RSC Balance: ${ethers.formatEther(newBalance)} ETH`);

    try {
        const newDebt = await rsc.debt();
        console.log(`Updated Debt: ${ethers.formatEther(newDebt)} ETH`);
    } catch (e) {
        console.log(`Could not read debt: ${e.message}`);
    }

    console.log("\nDone!");
}

main().catch(console.error);
