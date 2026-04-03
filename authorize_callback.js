const { ethers } = require("ethers");
require("dotenv").config({ path: "./contracts/.env" });

async function authorize(rpcUrl, processorAddress, callbackAddress, name) {
    console.log(`Authorizing on ${name}...`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const abi = ["function setWalletSwapMain(address) external"];
    const contract = new ethers.Contract(processorAddress, abi, wallet);
    
    const tx = await contract.setWalletSwapMain(callbackAddress);
    console.log(`${name} Tx Sent: ${tx.hash}`);
    await tx.wait();
    console.log(`${name} Authorized!`);
}

async function main() {
    const sepoliaRpc = "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b";
    const baseSepoliaRpc = "https://base-sepolia-rpc.publicnode.com";

    const sepoliaProcessor = "0x45bbbe32c91827b9587cf80702f22bfc4003dce0";
    const sepoliaCallback = "0x9B136EF2fb452cf39a535dB565F3140c83Ba4eFA";

    const baseSepoliaProcessor = "0xb330101ef5314971c7a24d3e89e26b98d3919354";
    const baseSepoliaCallback = "0xf5816eaec118F37ae77cD92793Ca968ef68B88E1";

    await authorize(sepoliaRpc, sepoliaProcessor, sepoliaCallback, "Sepolia");
    await authorize(baseSepoliaRpc, baseSepoliaProcessor, baseSepoliaCallback, "Base Sepolia");
}

main().catch(console.error);
