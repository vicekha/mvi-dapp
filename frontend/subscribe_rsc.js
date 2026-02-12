import { ethers } from 'ethers';

const RPC_URL = "https://lasna-rpc.rnk.dev/";
const PRIVATE_KEY = "0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088";
const RSC_ADDRESS = "0x175b9aa1be6D625C6C9ee3DF2e5379B8D4ED6649".toLowerCase();

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`Connected to Lasna at ${RPC_URL}`);
    console.log(`Wallet address: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    const abi = [
        "function subscribe() external payable"
    ];

    // Normalize address to avoid checksum errors
    const normalizedRSCAddress = ethers.getAddress(RSC_ADDRESS);
    const rsc = new ethers.Contract(normalizedRSCAddress, abi, wallet);

    console.log(`Calling subscribe() on RSC at ${normalizedRSCAddress}...`);

    // Sending 0.1 ETH to cover potential subscription fees
    try {
        const tx = await rsc.subscribe({ value: ethers.parseEther("0.1") });
        console.log(`Transaction sent: ${tx.hash}`);
        await tx.wait();
        console.log("Transaction confirmed!");
    } catch (error) {
        console.error("Error calling subscribe:", error);
        if (error.data) {
            console.error("Error data:", error.data);
        }
        if (error.revert) {
            console.error("Revert reason:", error.revert);
        }
    }
}

main().catch(console.error);
