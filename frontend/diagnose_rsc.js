
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

// Configuration
const CONTRACTS = {
    RSC: '0x29E48291381A3cB6198648eC53E91D4664Da95E4', // From contracts.ts
    // Tokens for Checking (Sepolia ETH -> Lasna LREACT)
    // Sepolia ETH Address (tokenIn for Order A)
    ETH_SEPOLIA: '0x0000000000000000000000000000000000000000',
    // Lasna LREACT Address (tokenOut for Order A / tokenIn for Order B)
    LREACT_LASNA: '0x0000000000000000000000000000000000000000',
    // Test Token Address if used
    // TEST_SEPOLIA: '0x0384754fe5780cacafcfad6ebd383ae98e496e48',

    // Chains
    SEPOLIA_ID: 11155111,
    LASNA_ID: 5318007
};

const RSC_ABI = [
    'function chainA() view returns (uint256)',
    'function chainB() view returns (uint256)',
    'function walletSwapA() view returns (address)',
    'function walletSwapB() view returns (address)',
    'function owner() view returns (address)',
    'function getOrderCount(uint256 chainId, address tIn, address tOut) view returns (uint256)',
    'function getOrder(uint256 chainId, address tIn, address tOut, uint256 index) view returns (tuple(bytes32 orderId, address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 timestamp, uint256 chainId, uint256 targetChainId))'
];

async function main() {
    const provider = new ethers.JsonRpcProvider(LASNA_RPC);
    const rsc = new ethers.Contract(CONTRACTS.RSC, RSC_ABI, provider);

    console.log(">>> RSC DIAGNOSTICS <<<");
    console.log(`RSC Address: ${CONTRACTS.RSC}`);

    try {
        const cA = await rsc.chainA();
        const cB = await rsc.chainB();
        console.log(`Configured Chain A: ${cA}`);
        console.log(`Configured Chain B: ${cB}`);

        const wsA = await rsc.walletSwapA();
        const wsB = await rsc.walletSwapB();
        console.log(`WalletSwap A: ${wsA}`);
        console.log(`WalletSwap B: ${wsB}`);

        // Check Orders from Sepolia (ETH -> LREACT)
        // Note: tokenOut is LREACT (on Lasna, which is 0x0).
        // Wait, did I use the correct addresses?
        // In SwapPanel, LREACT is 0x0.
        // So User A (Sepolia): In=0x0 (ETH), Out=0x0 (LREACT).

        const countSepolia = await rsc.getOrderCount(CONTRACTS.SEPOLIA_ID, CONTRACTS.ETH_SEPOLIA, CONTRACTS.LREACT_LASNA);
        console.log(`\nOrders from SEPOLIA (ETH -> LREACT): ${countSepolia}`);

        if (countSepolia > 0) {
            const order = await rsc.getOrder(CONTRACTS.SEPOLIA_ID, CONTRACTS.ETH_SEPOLIA, CONTRACTS.LREACT_LASNA, 0);
            console.log("Sample Order:", order);
        }

        // Check Orders from Lasna (LREACT -> ETH)
        const countLasna = await rsc.getOrderCount(CONTRACTS.LASNA_ID, CONTRACTS.LREACT_LASNA, CONTRACTS.ETH_SEPOLIA);
        console.log(`Orders from LASNA (LREACT -> ETH): ${countLasna}`);
        if (countLasna > 0) {
            const order = await rsc.getOrder(CONTRACTS.LASNA_ID, CONTRACTS.LREACT_LASNA, CONTRACTS.ETH_SEPOLIA, 0);
            console.log("Sample Order:", order);
        }

    } catch (e) {
        console.error("Diagnostic Failed:", e);
    }
}

main().catch(console.error);
