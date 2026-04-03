const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function main() {
    const rpcUrl = process.env.LASNA_RPC_URL || "https://lasna-rpc.rnk.dev/";
    const privateKey = process.env.PRIVATE_KEY;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log("Deploying from:", wallet.address);

    const bytecodePath = path.join(__dirname, "rsc_bytecode.txt");
    let bytecode = fs.readFileSync(bytecodePath, "utf8").trim();
    if (!bytecode.startsWith("0x")) {
        bytecode = "0x" + bytecode;
    }

    const abi = [
        "constructor(address _owner, uint256[] _initialChainIds, address[] _initialContracts) payable"
    ];

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    // Chain IDs and Callback addresses from addresses.json
    const chainIds = [11155111, 84532, 14601];
    const callbacks = [
        "0x9B136EF2fb452cf39a535dB565F3140c83Ba4eFA", // Sepolia
        "0xf5816eaec118F37ae77cD92793Ca968ef68B88E1", // Base Sepolia
        "0xa2f63f4F1C4A3DE69f66F1dcDDBb2d8068f02863"  // Sonic Testnet
    ];

    console.log("Constructor args:", wallet.address, chainIds, callbacks);

    const contract = await factory.deploy(wallet.address, chainIds, callbacks);
    console.log("Waiting for deployment transaction:", contract.deploymentTransaction().hash);
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log("MviSwapReactiveTestnet deployed to:", address);
    fs.writeFileSync("deployed_rsc_testnet.txt", address);
}

main().catch(console.error);
