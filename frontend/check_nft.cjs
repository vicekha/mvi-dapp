const { ethers } = require('ethers');

async function main() {
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const nftAddress = '0x87f76f61a2da488694024de34a350dada3f242da';
    const ownerAddress = '0xB133a194893434107925682789F16662FB9DB062';

    const nftAbi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address) view returns (uint256)",
        "function ownerOf(uint256) view returns (address)",
        "function tokenByIndex(uint256) view returns (uint256)"
    ];

    const nft = new ethers.Contract(nftAddress, nftAbi, provider);

    console.log('=== Alpha Devs NFT Verification ===\n');
    console.log('Name:', await nft.name());
    console.log('Symbol:', await nft.symbol());
    console.log('Total Supply:', (await nft.totalSupply()).toString());
    console.log('Your Balance:', (await nft.balanceOf(ownerAddress)).toString());

    console.log('\nOwnership of Token IDs 0-9:');
    for (let i = 0; i < 10; i++) {
        const owner = await nft.ownerOf(i);
        console.log(`  Token #${i}: ${owner}`);
    }
}

main().catch(console.error);
