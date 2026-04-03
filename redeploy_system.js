const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: "./contracts/.env" });

const RPC_URLS = {
    sepolia: "https://sepolia.infura.io/v3/f1acfbce451e4aacaa17dca761ec4e8b",
    base_sepolia: "https://base-sepolia-rpc.publicnode.com",
    lasna: "https://lasna-rpc.rnk.dev/"
};

const CALLBACK_PROXIES = {
    sepolia: "0xc9f36411C9897e7F959D99ffca2a0Ba7ee0D7bDA",
    base_sepolia: "0xa6eA49Ed671B8a4dfCDd34E36b7a75Ac79B8A5a6"
};

const EXISTING_PROCESSORS = {
    sepolia: "0x45bbbe32c91827b9587cf80702f22bfc4003dce0",
    base_sepolia: "0xb330101ef5314971c7a24d3e89e26b98d3919354"
};

const EXISTING_POOLS = {
    sepolia: "0x070857e366a409f4a1eb83090e4d510f0714b3d7",
    base_sepolia: "0x856d38fa3659458e82a883542a325844f8a8aa59"
};

const EXISTING_FEES = {
    sepolia: "0x36ab0f841fd3f08ce7806b5fb357ae7af6fba7af",
    base_sepolia: "0xe25d9f39f776e6d6ef0689282a9ddfdd1ed00059"
};

const EXISTING_VERIFIERS = {
    sepolia: "0xf1fb65f4717651a86e42fbb54b503a92ec687aae",
    base_sepolia: "0x99addd62d68a17fbdfe8ba522e6813d0ce28f95f"
};

async function deployCallback(networkName) {
    console.log(`\n--- Deploying WalletSwapCallback on ${networkName} ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS[networkName]);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const artifactPath = path.join(__dirname, "contracts/out/WalletSwapCallback.sol/WalletSwapCallback.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);

    const contract = await factory.deploy(
        EXISTING_POOLS[networkName],
        EXISTING_PROCESSORS[networkName],
        EXISTING_FEES[networkName],
        EXISTING_VERIFIERS[networkName],
        CALLBACK_PROXIES[networkName]
    );
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`${networkName} WalletSwapCallback: ${addr}`);
    return addr;
}

async function deployCoordinator(sepoliaCallback, baseCallback) {
    console.log(`\n--- Deploying MviSwapReactive on Lasna ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS.lasna);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const bytecode = fs.readFileSync(path.join(__dirname, "contracts/rsc_bytecode.txt"), "utf8").trim();
    const abi = ["constructor(address _owner, uint256[] _initialChainIds, address[] _initialContracts) payable"];
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const chainIds = [11155111, 84532];
    const callbacks = [sepoliaCallback, baseCallback];

    const contract = await factory.deploy(wallet.address, chainIds, callbacks, { value: ethers.parseEther("0.5") });
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`Lasna MviSwapReactive: ${addr}`);
    return addr;
}

async function setupPermissions(networkName, callbackAddr, coordinatorAddr) {
    console.log(`\n--- Configuring Permissions on ${networkName} ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS[networkName]);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    // 1. Authorize on Processor
    const processorAbi = ["function setWalletSwapMain(address) external"];
    const processor = new ethers.Contract(EXISTING_PROCESSORS[networkName], processorAbi, wallet);
    console.log(`Setting walletSwapMain on Processor...`);
    const tx1 = await processor.setWalletSwapMain(callbackAddr);
    await tx1.wait();

    // 2. Authorize RVM on Callback
    const callbackAbi = ["function setAuthorizedReactiveVM(address) external", "function setCallbackProxy(address) external"];
    const callback = new ethers.Contract(callbackAddr, callbackAbi, wallet);
    console.log(`Setting rvm_id and callback_sender on Callback...`);
    const tx2 = await callback.setAuthorizedReactiveVM(coordinatorAddr);
    await tx2.wait();
    
    // 3. Fund Callback for Gas
    console.log(`Funding Callback for Gas...`);
    const tx3 = await wallet.sendTransaction({ to: callbackAddr, value: ethers.parseEther("0.02") });
    await tx3.wait();
    
    // 4. Update Pool Authorizations
    const poolAbi = ["function setAuthorizedCaller(address,bool) external"];
    const pool = new ethers.Contract(EXISTING_POOLS[networkName], poolAbi, wallet);
    console.log(`Updating Pool Authorizations...`);
    const tx4 = await pool.setAuthorizedCaller(callbackAddr, true);
    await tx4.wait();

    console.log(`${networkName} configuration complete.`);
}

async function main() {
    const sepoliaCallback = await deployCallback("sepolia");
    const baseCallback = await deployCallback("base_sepolia");
    const coordinator = await deployCoordinator(sepoliaCallback, baseCallback);

    await setupPermissions("sepolia", sepoliaCallback, coordinator);
    await setupPermissions("base_sepolia", baseCallback, coordinator);

    const deployedAddresses = {
        coordinator,
        sepoliaCallback,
        baseCallback
    };
    fs.writeFileSync("redeploy_result.json", JSON.stringify(deployedAddresses, null, 2));
    console.log("\nREDEPLOYMENT SYSTEM SUCCESSFUL");
    console.log(deployedAddresses);
}

main().catch(console.error);
