
import { ethers } from "ethers";

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const LASNA_RPC = "https://lasna-rpc.rnk.dev/";

const SEPOLIA_WALLET_SWAP = '0xF23918fa9e055a4bFF928432a5D2d980CFA62fe4';
const LASNA_WALLET_SWAP = '0x1F80D729C41B5a7E33502CE41851aDcBDf1B4E87';
const RSC_ADDRESS = '0x29E48291381A3cB6198648eC53E91D4664Da95E4';

const ABI = [
    'function callbackProxy() view returns (address)',
    'function authorizedReactiveVM() view returns (address)'
];

async function main() {
    console.log(">>> SYSTEM DIAGNOSTICS <<<");

    // Check Sepolia
    const provSepolia = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const contractSepolia = new ethers.Contract(SEPOLIA_WALLET_SWAP, ABI, provSepolia);
    try {
        const proxy = await contractSepolia.callbackProxy();
        const auth = await contractSepolia.authorizedReactiveVM();
        console.log(`[Sepolia] WalletSwapMain: ${SEPOLIA_WALLET_SWAP}`);
        console.log(`[Sepolia] CallbackProxy:  ${proxy}`);
        console.log(`[Sepolia] AuthorizedRSC:  ${auth}`);
        console.log(`[Sepolia] Expected RSC:   ${RSC_ADDRESS}`);
    } catch (e) {
        console.error("[Sepolia] Failed:", e.message);
    }

    // Check Lasna
    const provLasna = new ethers.JsonRpcProvider(LASNA_RPC);
    const contractLasna = new ethers.Contract(LASNA_WALLET_SWAP, ABI, provLasna);
    try {
        const proxy = await contractLasna.callbackProxy();
        const auth = await contractLasna.authorizedReactiveVM();
        console.log(`[Lasna]   WalletSwapMain: ${LASNA_WALLET_SWAP}`);
        console.log(`[Lasna]   CallbackProxy:  ${proxy}`);
        console.log(`[Lasna]   AuthorizedRSC:  ${auth}`);
        console.log(`[Lasna] Expected RSC:     ${RSC_ADDRESS}`);
    } catch (e) {
        console.error("[Lasna] Failed:", e.message);
    }
}

main().catch(console.error);
