
import { ethers } from "ethers";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

const SEPOLIA_WALLET_SWAP = '0xF23918fa9e055a4bFF928432a5D2d980CFA62fe4';
const LASNA_WALLET_SWAP = '0x1F80D729C41B5a7E33502CE41851aDcBDf1B4E87';

const EVENT_SIG = 'event InterChainOwnershipExchanged(bytes32 indexed orderId, address indexed maker, address indexed beneficiary, address tokenIn, uint256 amount)';

async function checkEvents(name, rpc, address) {
    const provider = new ethers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(address, [EVENT_SIG], provider);

    console.log(`Checking ${name} (${address})...`);
    try {
        const block = await provider.getBlockNumber();
        const fromBlock = block - 5000; // Check last 5000 blocks

        const filter = contract.filters.InterChainOwnershipExchanged();
        const logs = await contract.queryFilter(filter, fromBlock);

        console.log(`Found ${logs.length} events in last 5000 blocks.`);
        if (logs.length > 0) {
            console.log("Last Event:", logs[logs.length - 1].args);
        }
    } catch (e) {
        console.error(`${name} Failed:`, e.message);
    }
}

async function main() {
    await checkEvents("Sepolia", SEPOLIA_RPC, SEPOLIA_WALLET_SWAP);
    await checkEvents("Lasna", LASNA_RPC, LASNA_WALLET_SWAP);
}

main().catch(console.error);
