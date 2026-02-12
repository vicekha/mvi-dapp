
import { ethers } from 'ethers';

// CONFIG
const SEPOLIA_RPC = "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const PRIVATE_KEY = "0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088";

// CONTRACTS
const SEPOLIA_WALLET = "0x4a267C1b4926056932659577E6c2C7E15d4AFFEd";
const LASNA_WALLET = "0x61274f9ccf9708ad588c21aaf07bfc1c214ccc01";
const RSC_ADDRESS = "0x293d89d6673C40A9c4aBDB10B9F0e127882f73b0";

// ABI for executeInterChainOrder
const ABI = [
    "function executeInterChainOrder(address rvmId, bytes32 orderId, address beneficiary, uint256 amount) external"
];

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log("Usage: node manual_swap.js <chain: Sepolia|Lasna> <orderId> <beneficiary> <amount>");
        return;
    }

    const chain = args[0];
    const orderId = args[1];
    const beneficiary = args[2];
    const amount = ethers.parseEther(args[3]); // Assuming ETH/Native amount input

    let rpc, contractAddr;
    if (chain.toLowerCase() === 'sepolia') {
        rpc = SEPOLIA_RPC;
        contractAddr = SEPOLIA_WALLET;
    } else if (chain.toLowerCase() === 'lasna') {
        rpc = LASNA_RPC;
        contractAddr = LASNA_WALLET;
    } else {
        console.error("Invalid chain. Use 'Sepolia' or 'Lasna'");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(contractAddr, ABI, wallet);

    console.log(`Executing swap on ${chain}...`);
    console.log(`OrderId: ${orderId}`);
    console.log(`Beneficiary: ${beneficiary}`);
    console.log(`Amount: ${ethers.formatEther(amount)}`);

    try {
        const tx = await contract.executeInterChainOrder(
            RSC_ADDRESS, // Use the real RSC address as ID, but WE are the signer (authorized Proxy)
            orderId,
            beneficiary,
            amount
        );
        console.log(`Transaction sent: ${tx.hash}`);
        await tx.wait();
        console.log("Swap Executed Successfully!");
    } catch (error) {
        console.error("Swap Failed:", error);
    }
}

main();
