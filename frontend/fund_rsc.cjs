const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    // Load private key
    const envPath = path.join(__dirname, '..', 'contracts', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const privateKeyMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);

    if (!privateKeyMatch) {
        throw new Error('Could not find PRIVATE_KEY in ../contracts/.env');
    }

    const privateKey = privateKeyMatch[1];
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const wallet = new ethers.Wallet(privateKey, provider);

    const rscAddress = '0x536e618364c9b2f7966ac7aaf08606d88397a5ca';
    const fundAmount = ethers.parseEther('0.5'); // Fund with 0.5 Lasna ETH

    console.log('Wallet Address:', wallet.address);
    console.log('Wallet Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'LREACT');
    console.log('RSC Address:', rscAddress);
    console.log('RSC Current Balance:', ethers.formatEther(await provider.getBalance(rscAddress)), 'LREACT');
    console.log('Funding Amount:', ethers.formatEther(fundAmount), 'LREACT');

    try {
        const tx = await wallet.sendTransaction({
            to: rscAddress,
            value: fundAmount
        });
        console.log('Funding TX:', tx.hash);
        await tx.wait();
        console.log('Funding TX Confirmed!');
        console.log('RSC New Balance:', ethers.formatEther(await provider.getBalance(rscAddress)), 'LREACT');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

main();
