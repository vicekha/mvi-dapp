const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: "./contracts/.env" });

const RPC_URLS = {
    sepolia: "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b",
    base_sepolia: "https://base-sepolia-rpc.publicnode.com",
    lasna: "https://lasna-rpc.rnk.dev/"
};

const CHAIN_IDS = {
    sepolia: 11155111,
    base_sepolia: 84532
};

const CALLBACK_ADDRESSES = {
    sepolia: "0xbab1e1D2Cc51df7aDc40BDe248929b8E5652F114",
    base_sepolia: "0x33075a00670e48DE19fAFCEB42fF4CEdB3C18d35"
};

async function deployCoordinator() {
    console.log(`\n--- Deploying MviSwapReactive on Lasna ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS.lasna);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const bytecode = fs.readFileSync(path.join(__dirname, "contracts/rsc_bytecode.txt"), "utf8").trim();
    const abi = ["constructor(address _owner, uint256[] _initialChainIds, address[] _initialContracts) payable"];
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const chainIds = [CHAIN_IDS.sepolia, CHAIN_IDS.base_sepolia];
    const callbakAddressList = [CALLBACK_ADDRESSES.sepolia, CALLBACK_ADDRESSES.base_sepolia];

    console.log(`Constructor params:`);
    console.log(`  Owner: ${wallet.address}`);
    console.log(`  ChainIds: [${chainIds}]`);
    console.log(`  Callbacks: [${callbakAddressList}]`);

    const contract = await factory.deploy(wallet.address, chainIds, callbakAddressList, { value: ethers.parseEther("0.1") });
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`Lasna MviSwapReactive Deployed at: ${addr}`);
    return addr;
}

async function authorizeRVM(networkName, callbackAddr, coordinatorAddr) {
    console.log(`\n--- Authorizing RSC on ${networkName} (${callbackAddr}) ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS[networkName]);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const callbackAbi = ["function setAuthorizedReactiveVM(address) external"];
    const callback = new ethers.Contract(callbackAddr, callbackAbi, wallet);

    console.log(`Calling setAuthorizedReactiveVM(${coordinatorAddr})...`);
    const tx = await callback.setAuthorizedReactiveVM(coordinatorAddr);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✓ Authorized`);
}

async function main() {
    const coordinator = await deployCoordinator();

    await authorizeRVM("sepolia", CALLBACK_ADDRESSES.sepolia, coordinator);
    await authorizeRVM("base_sepolia", CALLBACK_ADDRESSES.base_sepolia, coordinator);

    const redeployResult = {
        coordinator,
        sepoliaCallback: CALLBACK_ADDRESSES.sepolia,
        baseCallback: CALLBACK_ADDRESSES.base_sepolia,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("redeploy_result_final.json", JSON.stringify(redeployResult, null, 2));
    console.log("\nREDEPLOYMENT SYSTEM SUCCESSFUL");
    console.log(redeployResult);
}

main().catch(console.error);
