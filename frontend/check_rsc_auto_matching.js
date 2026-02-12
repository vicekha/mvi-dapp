import { ethers } from "ethers";

// Configuration
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const RSC_ADDRESS = "0xb54055f41b52fca827b0d19c6bf7c6fd418eb88e"; // From addresses.json

const CONTRACTS = {
    lasna: {
        chainId: 5318007,
        WalletSwapMain: "0x7b14e97A1bf98F6673eA8617de430e2b8697B52c",
    },
    sepolia: {
        chainId: 11155111,
        WalletSwapMain: "0x7135f0111a362a326d9eC3E790F026851872468C",
    }
};

const RSC_ABI = [
    "function chainA() view returns (uint256)",
    "function chainB() view returns (uint256)",
    "function walletSwapA() view returns (address)",
    "function walletSwapB() view returns (address)",
    "function owner() view returns (address)",
    "function initialized() view returns (bool)",
    "function manualSubscribe(uint256 chainId, address contractAddr) external",
    "function getOrderCount(uint256 chainId, address tIn, address tOut) view returns (uint256)",
    "event MatchFound(bytes32 indexed orderA, bytes32 indexed orderB, uint256 timestamp)"
];

const WALLET_SWAP_ABI = [
    "function authorizedReactiveVM() view returns (address)",
    "function callbackProxy() view returns (address)",
    "function setAuthorizedReactiveVM(address _rvm) external",
    "function setCallbackProxy(address _proxy) external"
];

async function checkRSCStatus() {
    console.log("🔍 RSC AUTO-MATCHING DIAGNOSTIC");
    console.log("=".repeat(80));

    const provider = new ethers.JsonRpcProvider(LASNA_RPC);
    const rsc = new ethers.Contract(RSC_ADDRESS, RSC_ABI, provider);

    console.log(`\nRSC Address: ${RSC_ADDRESS}`);
    console.log(`\n1️⃣  RSC CONFIGURATION CHECK:`);
    console.log("─".repeat(80));

    try {
        const chainA = await rsc.chainA();
        const chainB = await rsc.chainB();
        const walletSwapA = await rsc.walletSwapA();
        const walletSwapB = await rsc.walletSwapB();
        const owner = await rsc.owner();
        const initialized = await rsc.initialized();

        console.log(`✅ Chain A: ${chainA} ${chainA === 5318007n ? '(Lasna)' : ''}`);
        console.log(`✅ Chain B: ${chainB} ${chainB === 11155111n ? '(Sepolia)' : ''}`);
        console.log(`✅ WalletSwap A: ${walletSwapA}`);
        console.log(`✅ WalletSwap B: ${walletSwapB}`);
        console.log(`✅ Owner: ${owner}`);
        console.log(`${initialized ? '✅' : '❌'} Initialized: ${initialized}`);
    } catch (e) {
        console.log(`❌ Error reading RSC: ${e.message}`);
        return;
    }

    // Check RSC balance
    console.log(`\n2️⃣  RSC FUNDING CHECK:`);
    console.log("─".repeat(80));
    const balance = await provider.getBalance(RSC_ADDRESS);
    console.log(`RSC Balance: ${ethers.formatEther(balance)} REACT`);
    if (balance < ethers.parseEther("0.1")) {
        console.log(`⚠️  WARNING: RSC balance is low. Consider funding for gas.`);
    } else {
        console.log(`✅ RSC is sufficiently funded`);
    }

    // Check authorizedReactiveVM on both chains
    console.log(`\n3️⃣  AUTHORIZATION CHECK:`);
    console.log("─".repeat(80));

    // Check Lasna
    const lasnaWalletSwap = new ethers.Contract(
        CONTRACTS.lasna.WalletSwapMain,
        WALLET_SWAP_ABI,
        provider
    );
    const lasnaAuthorizedRVM = await lasnaWalletSwap.authorizedReactiveVM();
    console.log(`\nLasna WalletSwapMain:`);
    console.log(`  authorizedReactiveVM: ${lasnaAuthorizedRVM}`);
    console.log(`  ${lasnaAuthorizedRVM.toLowerCase() === RSC_ADDRESS.toLowerCase() ? '✅' : '❌'} ${lasnaAuthorizedRVM.toLowerCase() === RSC_ADDRESS.toLowerCase() ? 'Correctly set to RSC' : 'NOT SET - CRITICAL ISSUE'}`);

    // Check Sepolia
    const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const sepoliaWalletSwap = new ethers.Contract(
        CONTRACTS.sepolia.WalletSwapMain,
        WALLET_SWAP_ABI,
        sepoliaProvider
    );
    const sepoliaAuthorizedRVM = await sepoliaWalletSwap.authorizedReactiveVM();
    console.log(`\nSepolia WalletSwapMain:`);
    console.log(`  authorizedReactiveVM: ${sepoliaAuthorizedRVM}`);
    console.log(`  ${sepoliaAuthorizedRVM.toLowerCase() === RSC_ADDRESS.toLowerCase() ? '✅' : '❌'} ${sepoliaAuthorizedRVM.toLowerCase() === RSC_ADDRESS.toLowerCase() ? 'Correctly set to RSC' : 'NOT SET - CRITICAL ISSUE'}`);

    // Check for recent MatchFound events
    console.log(`\n4️⃣  RECENT MATCHING ACTIVITY:`);
    console.log("─".repeat(80));
    try {
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, latestBlock - 5000); // Last ~5000 blocks

        const filter = rsc.filters.MatchFound();
        const events = await rsc.queryFilter(filter, fromBlock);

        console.log(`Found ${events.length} MatchFound events in last 5000 blocks`);
        if (events.length > 0) {
            console.log(`\nRecent matches:`);
            events.slice(-5).forEach((event, idx) => {
                console.log(`  ${idx + 1}. Order ${event.args[0].substring(0, 10)}... ↔ ${event.args[1].substring(0, 10)}...`);
                console.log(`     Block: ${event.blockNumber}`);
            });
        } else {
            console.log(`⚠️  No matches found recently - RSC may not be subscribed or no orders match`);
        }
    } catch (e) {
        console.log(`Error fetching events: ${e.message}`);
    }

    // Summary and recommendations
    console.log(`\n${'='.repeat(80)}`);
    console.log("📋 SUMMARY & REQUIRED ACTIONS:");
    console.log('='.repeat(80));

    console.log(`\n✅ RSC is deployed and configured`);

    if (balance < ethers.parseEther("0.1")) {
        console.log(`⚠️  ACTION REQUIRED: Fund RSC with REACT tokens`);
        console.log(`   Command: cast send ${RSC_ADDRESS} --value 1ether --rpc-url ${LASNA_RPC} --private-key YOUR_KEY`);
    }

    if (lasnaAuthorizedRVM.toLowerCase() !== RSC_ADDRESS.toLowerCase()) {
        console.log(`❌ CRITICAL: Set authorizedReactiveVM on Lasna`);
        console.log(`   Command: cast send ${CONTRACTS.lasna.WalletSwapMain} "setAuthorizedReactiveVM(address)" ${RSC_ADDRESS} --rpc-url ${LASNA_RPC} --private-key YOUR_KEY`);
    }

    if (sepoliaAuthorizedRVM.toLowerCase() !== RSC_ADDRESS.toLowerCase()) {
        console.log(`❌ CRITICAL: Set authorizedReactiveVM on Sepolia`);
        console.log(`   Command: cast send ${CONTRACTS.sepolia.WalletSwapMain} "setAuthorizedReactiveVM(address)" ${RSC_ADDRESS} --rpc-url ${SEPOLIA_RPC} --private-key YOUR_KEY`);
    }

    console.log(`\n⚠️  SUBSCRIPTION CHECK:`);
    console.log(`The RSC must be manually subscribed to OrderInitiated events.`);
    console.log(`This requires calling manualSubscribe() on the RSC.`);
    console.log(`\nSubscription commands (run from deployer account):`);
    console.log(`1. Subscribe to Lasna:`);
    console.log(`   cast send ${RSC_ADDRESS} "manualSubscribe(uint256,address)" ${CONTRACTS.lasna.chainId} ${CONTRACTS.lasna.WalletSwapMain} --rpc-url ${LASNA_RPC} --private-key YOUR_KEY`);
    console.log(`\n2. Subscribe to Sepolia:`);
    console.log(`   cast send ${RSC_ADDRESS} "manualSubscribe(uint256,address)" ${CONTRACTS.sepolia.chainId} ${CONTRACTS.sepolia.WalletSwapMain} --rpc-url ${LASNA_RPC} --private-key YOUR_KEY`);

    console.log(`\n💡 TESTING AUTO-MATCHING:`);
    console.log(`After fixing the above issues, create two opposite orders:`);
    console.log(`1. Order A on Lasna: 100 LREACT → 1 TEST (targetChainId = 0)`);
    console.log(`2. Order B on Lasna: 1 TEST → 100 LREACT (targetChainId = 0)`);
    console.log(`\nThe RSC should detect Order B, find Order A in its shadow book, and trigger callbacks to execute the match.`);
}

checkRSCStatus().catch(console.error);
