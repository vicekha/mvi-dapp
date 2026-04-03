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

const PK = process.env.PRIVATE_KEY;
const TRUST_WALLET = process.env.TRUST_WALLET || "0x0dB12aAC15a63303d1363b8C862332C699Cca561";

function getArtifact(name) {
    const artifactPath = path.join(__dirname, `contracts/out/${name}.sol/${name}.json`);
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployCoreStack(networkName) {
    console.log(`\n--- Deploying Core Stack on ${networkName} ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS[networkName]);
    const wallet = new ethers.Wallet(PK, provider);

    // 1. VirtualLiquidityPool
    const poolArt = getArtifact("VirtualLiquidityPool");
    const poolFactory = new ethers.ContractFactory(poolArt.abi, poolArt.bytecode.object, wallet);
    const pool = await poolFactory.deploy();
    await pool.waitForDeployment();
    const poolAddr = await pool.getAddress();
    console.log(`Pool: ${poolAddr}`);

    // 2. AssetVerifier
    const verArt = getArtifact("AssetVerifier");
    const verFactory = new ethers.ContractFactory(verArt.abi, verArt.bytecode.object, wallet);
    const verifier = await verArt.deploy ? await verFactory.deploy() : await verFactory.deploy(); // Safety check
    await verifier.waitForDeployment();
    const verifierAddr = await verifier.getAddress();
    console.log(`Verifier: ${verifierAddr}`);

    // 3. TrustWalletFeeDistributor
    const feeArt = getArtifact("TrustWalletFeeDistributor");
    const feeFactory = new ethers.ContractFactory(feeArt.abi, feeArt.bytecode.object, wallet);
    const fee = await feeFactory.deploy(TRUST_WALLET);
    await fee.waitForDeployment();
    const feeAddr = await fee.getAddress();
    console.log(`FeeDistributor: ${feeAddr}`);

    // 4. EulerLagrangeOrderProcessor
    const procArt = getArtifact("EulerLagrangeOrderProcessor");
    const procFactory = new ethers.ContractFactory(procArt.abi, procArt.bytecode.object, wallet);
    const processor = await procFactory.deploy(poolAddr, feeAddr, verifierAddr);
    await processor.waitForDeployment();
    const processorAddr = await processor.getAddress();
    console.log(`Processor: ${processorAddr}`);

    // 5. WalletSwapCallback
    const cbArt = getArtifact("WalletSwapCallback");
    const cbFactory = new ethers.ContractFactory(cbArt.abi, cbArt.bytecode.object, wallet);
    const callback = await cbFactory.deploy(poolAddr, processorAddr, feeAddr, verifierAddr, CALLBACK_PROXIES[networkName]);
    await callback.waitForDeployment();
    const callbackAddr = await callback.getAddress();
    console.log(`Callback: ${callbackAddr}`);

    // CONFIGURATION
    console.log(`Configuring ${networkName} stack...`);
    
    // Authorize Processor on Pool
    await (await pool.setAuthorizedCaller(processorAddr, true)).wait();
    // Authorize Callback on Pool
    await (await pool.setAuthorizedCaller(callbackAddr, true)).wait();
    
    // Set WalletSwapMain on Processor to Callback
    await (await processor.setWalletSwapMain(callbackAddr)).wait();
    
    // Set Min order value
    await (await processor.setMinimumOrderValue(ethers.parseEther("0.001"))).wait();

    // Fund Callback
    const tx = await wallet.sendTransaction({ to: callbackAddr, value: ethers.parseEther("0.05") });
    await tx.wait();
    console.log(`Funded callback with 0.05 ETH`);

    return { poolAddr, verifierAddr, feeAddr, processorAddr, callbackAddr };
}

async function deployCoordinator(sepoliaCallback, baseCallback) {
    console.log(`\n--- Deploying MviSwapReactive on Lasna ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS.lasna);
    const wallet = new ethers.Wallet(PK, provider);

    const bytecode = fs.readFileSync(path.join(__dirname, "contracts/rsc_bytecode.txt"), "utf8").trim();
    const abi = ["constructor(address _owner, uint256[] _initialChainIds, address[] _initialContracts) payable"];
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    const chainIds = [11155111, 84532];
    const callbacks = [sepoliaCallback, baseCallback];

    // Deploy with 0.5 REACT initial funding
    const contract = await factory.deploy(wallet.address, chainIds, callbacks, { value: ethers.parseEther("0.5") });
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`Lasna MviSwapReactive: ${addr}`);
    return addr;
}

async function authorizeRvm(networkName, callbackAddr, coordinatorAddr) {
    console.log(`\n--- Finalizing RVM Authorization on ${networkName} ---`);
    const provider = new ethers.JsonRpcProvider(RPC_URLS[networkName]);
    const wallet = new ethers.Wallet(PK, provider);

    const abi = ["function setAuthorizedReactiveVM(address) external"];
    const callback = new ethers.Contract(callbackAddr, abi, wallet);
    const tx = await callback.setAuthorizedReactiveVM(coordinatorAddr);
    await tx.wait();
    console.log(`RVM Authorized!`);
}

async function main() {
    console.log("STARTING FULL REDEPLOYMENT...");
    const sepolia = await deployCoreStack("sepolia");
    const base = await deployCoreStack("base_sepolia");
    const coordinator = await deployCoordinator(sepolia.callbackAddr, base.callbackAddr);

    await authorizeRvm("sepolia", sepolia.callbackAddr, coordinator);
    await authorizeRvm("base_sepolia", base.callbackAddr, coordinator);

    const results = {
        "11155111": {
            "VirtualLiquidityPool": sepolia.poolAddr,
            "AssetVerifier": sepolia.verifierAddr,
            "TrustWalletFeeDistributor": sepolia.feeAddr,
            "EulerLagrangeOrderProcessor": sepolia.processorAddr,
            "WalletSwapCallback": sepolia.callbackAddr
        },
        "84532": {
            "VirtualLiquidityPool": base.poolAddr,
            "AssetVerifier": base.verifierAddr,
            "TrustWalletFeeDistributor": base.feeAddr,
            "EulerLagrangeOrderProcessor": base.processorAddr,
            "WalletSwapCallback": base.callbackAddr
        },
        "5318007": {
            "SwapMatcherMultiChain": coordinator
        }
    };

    fs.writeFileSync("redeploy_full_result.json", JSON.stringify(results, null, 2));
    console.log("\nFULL SYSTEM REDEPLOYED SUCCESSFULLY");
    console.log(results);
}

main().catch(console.error);
