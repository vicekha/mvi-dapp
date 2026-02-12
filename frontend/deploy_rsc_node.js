
import { ethers } from 'ethers';
import { execSync } from 'child_process';

const RPC_URL = "https://lasna-rpc.rnk.dev/";
const PRIVATE_KEY = "0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088";

async function main() {
    try {
        console.log("Compiling bytecode...");
        // Ensure we run forge inspect from the contracts directory
        const bytecodeRaw = execSync('forge inspect src/SwapMatcherRSC.sol:SwapMatcherRSC bytecode', { cwd: '../contracts', encoding: 'utf-8' });
        const bytecode = bytecodeRaw.trim();
        console.log(`Bytecode length: ${bytecode.length}`);

        if (!bytecode || bytecode === '0x') {
            throw new Error("Failed to get bytecode");
        }

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

        const abi = [
            "constructor(address _service, uint256 _chainA, uint256 _chainB, address _walletSwapA, address _walletSwapB)"
        ];

        const factory = new ethers.ContractFactory(abi, bytecode, wallet);

        console.log("Deploying SwapMatcherRSC...");
        const contract = await factory.deploy(
            "0x0000000000000000000000000000000000fffFfF", // System
            11155111, // Sepolia
            5318007,  // Lasna
            "0x4a267C1b4926056932659577E6c2C7E15d4AFFEd", // Sepolia Wallet
            "0x61274f9ccf9708ad588c21aaf07bfc1c214ccc01"  // Lasna Wallet
        );

        console.log("Waiting for deployment transaction:", contract.deploymentTransaction().hash);
        await contract.waitForDeployment();

        const address = await contract.getAddress();
        console.log("SwapMatcherRSC deployed at:", address);

        // Write to file to avoid truncation issues
        const fs = await import('fs');
        fs.writeFileSync('rsc_address.txt', address);

    } catch (error) {
        console.error("Deployment failed:", error);
        process.exit(1);
    }
}

main();
