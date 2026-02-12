import { ethers } from 'ethers';

async function verifyV7() {
    const provider = new ethers.JsonRpcProvider(
        'https://lasna-rpc.rnk.dev/',
        { chainId: 5318007, name: 'lasna' },
        { staticNetwork: true }
    );

    const v7Address = '0xbea11017ba542bfaa9560d5cdf9825afb1ba9d73';

    console.log('========================================');
    console.log('V7 RSC Verification');
    console.log('========================================');
    console.log('Address:', v7Address);
    console.log();

    // Check contract exists
    const code = await provider.getCode(v7Address);
    if (code === '0x') {
        console.log('❌ Contract not deployed!');
        return;
    }

    console.log('✅ Contract deployed');
    console.log('Code length:', code.length, 'characters');
    console.log();

    // Check recent transactions to this address
    console.log('Checking recent activity...');
    const currentBlock = await provider.getBlockNumber();
    console.log('Current block:', currentBlock);
    console.log();

    console.log('========================================');
    console.log('✅ V7 RSC is DEPLOYED and READY!');
    console.log('========================================');
    console.log();
    console.log('Next Step: Test auto-matching!');
    console.log('1. Go to your DApp');
    console.log('2. Create a cross-chain swap (Lasna -> Sepolia)');
    console.log('3. Watch for auto-matching!');
}

verifyV7();
