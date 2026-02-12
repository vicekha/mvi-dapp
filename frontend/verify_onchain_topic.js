
import { ethers } from "ethers";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

const SEPOLIA_WALLET_SWAP = '0xF23918fa9e055a4bFF928432a5D2d980CFA62fe4';
const LASNA_WALLET_SWAP = '0x1F80D729C41B5a7E33502CE41851aDcBDf1B4E87';

async function checkEvents(name, rpc, address) {
    const provider = new ethers.JsonRpcProvider(rpc);

    console.log(`Checking ${name}...`);
    try {
        const block = await provider.getBlockNumber();
        const fromBlock = Math.max(0, block - 10000);

        // Generic filter for ALL logs from this contract
        const logs = await provider.getLogs({
            address: address,
            fromBlock: fromBlock,
            toBlock: 'latest'
        });

        console.log(`Found ${logs.length} total logs from contract.`);

        // Find OrderInitiated by checking topic_0
        for (const log of logs) {
            if (log.topics && log.topics.length > 0) {
                console.log(`Log Topic 0: ${log.topics[0]}`);
                // Just print first few to identify patterns
                break;
            }
        }
    } catch (e) {
        console.error(`${name} Failed:`, e.message);
    }
}

async function main() {
    // Calculate expected topic
    const sig = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)";
    const expectedTopic = ethers.keccak256(ethers.toUtf8Bytes(sig));
    console.log(`Expected Topic (from signature): ${expectedTopic}`);
    console.log("");

    await checkEvents("Sepolia", SEPOLIA_RPC, SEPOLIA_WALLET_SWAP);
    await checkEvents("Lasna", LASNA_RPC, LASNA_WALLET_SWAP);
}

main().catch(console.error);
