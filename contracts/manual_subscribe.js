const { ethers } = require('ethers');

async function subscribe() {
    console.log('=== Manual RSC Subscription ===\n');

    const provider = new ethers.JsonRpcProvider('https://lasna-rpc.rnk.dev/');
    const wallet = new ethers.Wallet(
        '0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088',
        provider
    );

    const rscAddress = '0x750b6aB0C38BDb756f5697b022B5493E8A6ea9206';

    console.log('Contract Address:', rscAddress);
    console.log('Deployer Address:', wallet.address);

    // Check balances
    const deployerBalance = await provider.getBalance(wallet.address);
    const contractBalance = await provider.getBalance(rscAddress);

    console.log('Deployer Balance:', ethers.formatEther(deployerBalance), 'LREACT');
    console.log('Contract Balance:', ethers.formatEther(contractBalance), 'LREACT\n');

    if (deployerBalance === 0n) {
        console.error('ERROR: Deployer has no gas. Please fund:', wallet.address);
        return;
    }

    if (contractBalance === 0n) {
        console.error('ERROR: Contract has no balance for subscription fee.');
        return;
    }

    const abi = ['function subscribe() external payable'];
    const rsc = new ethers.Contract(rscAddress, abi, wallet);

    console.log('Calling subscribe()...');
    try {
        const tx = await rsc.subscribe({ gasLimit: 3000000 });
        console.log('✓ Transaction sent:', tx.hash);
        console.log('Waiting for confirmation...\n');

        const receipt = await tx.wait();
        console.log('✓ Transaction confirmed!');
        console.log('Block:', receipt.blockNumber);
        console.log('Gas used:', receipt.gasUsed.toString());
        console.log('\n=== Subscription Successful! ===');
        console.log('Your RSC is now listening for cross-chain events.');
        console.log('Try creating a new swap order to test auto-matching!\n');
    } catch (error) {
        console.error('\n✗ Transaction failed:', error.message);
        if (error.message.includes('Unauthorized')) {
            console.error('The deployer is not the owner of this contract.');
        }
        throw error;
    }
}

subscribe().catch((error) => {
    console.error('\nFatal error:', error);
    process.exit(1);
});
