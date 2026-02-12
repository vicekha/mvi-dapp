const { ethers } = require('ethers');

const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';
const FEE_DIST_ADDR = '0x9d04018fe3e41d8283231527b10fff66fe3f2020';

const provider = new ethers.JsonRpcProvider(RPC_URL);

const abi = [
    "function calculateFee(address token, uint8 assetType, uint256 amount, uint256 minutesValuation) view returns (uint256)",
    "function feeRate() view returns (uint256)",
    "function defaultTrustWallet() view returns (address)"
];

const contract = new ethers.Contract(FEE_DIST_ADDR, abi, provider);

async function diagnostic() {
    try {
        console.log("--- FeeDistributor Diagnostic ---");
        const rate = await contract.feeRate();
        console.log("Current feeRate:", rate.toString());

        const wallet = await contract.defaultTrustWallet();
        console.log("Default Trust Wallet:", wallet);

        const testCases = [
            { amount: "100000000000000000", minutes: 5000, desc: "0.1 ETH, 5k mins" },
            { amount: "100000000000000000", minutes: 0, desc: "0.1 ETH, 0 mins" },
            { amount: "1000000000000000000", minutes: 0, desc: "1.0 ETH, 0 mins" },
            { amount: "0", minutes: 5000, desc: "0 ETH, 5k mins" }
        ];

        for (const tc of testCases) {
            const fee = await contract.calculateFee(
                "0x0000000000000000000000000000000000000000",
                0, // ERC20
                tc.amount,
                tc.minutes
            );
            console.log(`Fee for ${tc.desc}: ${fee.toString()} (${ethers.formatEther(fee)} ETH)`);
        }

    } catch (e) {
        console.error("Diagnostic failed:", e.message);
    }
}

diagnostic();
