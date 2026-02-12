const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    // Manually load private key from ../contracts/.env
    const envPath = path.join(__dirname, '..', 'contracts', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const privateKeyMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);

    if (!privateKeyMatch) {
        throw new Error('Could not find PRIVATE_KEY in ../contracts/.env');
    }

    const privateKey = privateKeyMatch[1];
    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const wallet = new ethers.Wallet(privateKey, provider);

    const rsc = '0x536e618364c9b2f7966ac7aaf08606d88397a5ca';
    const wsm = '0x26f39a1c4687645744d7e377f4738cda5164a254';

    console.log('Authorizing RSC on Lasna...');
    const abi = [
        "function setAuthorizedReactiveVM(address) external",
        "function setCallbackProxy(address) external",
        "function manualSubscribe(uint256,address) external"
    ];

    const wsmContract = new ethers.Contract(wsm, abi, wallet);
    const rscContract = new ethers.Contract(rsc, abi, wallet);

    try {
        let tx = await wsmContract.setAuthorizedReactiveVM(rsc);
        console.log('WSM Auth VM Tx:', tx.hash);
        await tx.wait();

        tx = await wsmContract.setCallbackProxy(rsc);
        console.log('WSM Callback Proxy Tx:', tx.hash);
        await tx.wait();

        console.log('Subscribing RSC to events...');
        // Sepolia
        tx = await rscContract.manualSubscribe(11155111, '0xb8489abc7f5df9add04579bb74ec3c958d59ee21');
        console.log('Subscribe Sepolia Tx:', tx.hash);
        await tx.wait();

        // Amoy
        tx = await rscContract.manualSubscribe(80002, '0xAD18d2B0578388fc4078C1cd7037e7c05E04014C');
        console.log('Subscribe Amoy Tx:', tx.hash);
        await tx.wait();

        // Lasna
        tx = await rscContract.manualSubscribe(5318007, wsm);
        console.log('Subscribe Lasna Tx:', tx.hash);
        await tx.wait();

        console.log('All authorizations complete!');
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
