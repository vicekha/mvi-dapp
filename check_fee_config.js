const ethers = require('ethers');

async function main() {
    const rpc = "https://ethereum-sepolia-rpc.publicnode.com";
    const provider = new ethers.JsonRpcProvider(rpc);
    const walletSwapAddr = "0xB8489abc7f5df9aDD04579bb74eC3C958D59Ee21";
    const abi = ["function feeDistributor() view returns (address)"];
    const contract = new ethers.Contract(walletSwapAddr, abi, provider);
    const feeDistributor = await contract.feeDistributor();
    console.log("FeeDistributor Address:", feeDistributor);

    const feeDistributorAbi = ["function feeRate() view returns (uint256)"];
    const feeDistributorContract = new ethers.Contract(feeDistributor, feeDistributorAbi, provider);
    const feeRate = await feeDistributorContract.feeRate();
    console.log("FeeRate:", feeRate.toString());
}

main();
