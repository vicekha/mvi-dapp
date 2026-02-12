
import { ethers } from "ethers";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

const SEPOLIA_WALLET_SWAP = '0xF23918fa9e055a4bFF928432a5D2d980CFA62fe4';
const LASNA_WALLET_SWAP = '0x1F80D729C41B5a7E33502CE41851aDcBDf1B4E87';

// Compute topic hash properly 
const sig = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)";
const ORDER_INITIATED_TOPIC = ethers.keccak256(ethers.toUtf8Bytes(sig));

async function checkOrderInitiated(name, rpc, address) {
    const provider = new ethers.JsonRpcProvider(rpc);

    console.log(`Checking ${name} for OrderInitiated...`);
    try {
        const block = await provider.getBlockNumber();
        const fromBlock = Math.max(0, block - 20000);

        const logs = await provider.getLogs({
            address: address,
            topics: [ORDER_INITIATED_TOPIC],
            fromBlock: fromBlock,
            toBlock: 'latest'
        });

        console.log(`Found ${logs.length} OrderInitiated events.`);

        if (logs.length > 0) {
            console.log("Last event block:", logs[logs.length - 1].blockNumber);
            console.log("Last event txHash:", logs[logs.length - 1].transactionHash);
        }
    } catch (e) {
        console.error(`${name} Failed:`, e.message);
    }
}

async function main() {
    console.log(`Computed Topic: ${ORDER_INITIATED_TOPIC}`);
    console.log("");

    await checkOrderInitiated("Sepolia", SEPOLIA_RPC, SEPOLIA_WALLET_SWAP);
    await checkOrderInitiated("Lasna", LASNA_RPC, LASNA_WALLET_SWAP);
}

main().catch(console.error);
