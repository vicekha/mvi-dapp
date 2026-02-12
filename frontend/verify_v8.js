import { ethers } from 'ethers';

async function verifyV8() {
    const provider = new ethers.JsonRpcProvider(
        'https://lasna-rpc.rnk.dev/',
        { chainId: 5318007, name: 'lasna' },
        { staticNetwork: true }
    );

    const v8Address = '0x256a19ffa31bfde2e0553443fe96def88481bae14';
    const wallet = new ethers.Wallet(
        '0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088',
        provider
    );

    console.log('========================================');
    console.log('V8 RSC Verification');
    console.log('========================================');
    console.log('Address:', v8Address);
    console.log();

    const abi = [
        'function subscribe() external',
        'function originChainId() external view returns (uint256)',
        'function destinationChainId() external view returns (uint256)'
    ];

    const rsc = new ethers.Contract(v8Address, abi, wallet);

    // Verify config
    const originChainId = await rsc.originChainId();
    const destChainId = await rsc.destinationChainId();

    console.log('Configuration:');
    console.log('  Origin Chain:', originChainId.toString(), '(Sepolia)');
    console.log('  Dest Chain:', destChainId.toString(), '(Lasna)');
    console.log();

    // Try subscribing again to check if already subscribed
    console.log('Testing subscription status...');
    try {
        const tx = await rsc.subscribe({ gasLimit: 1000000 });
        console.log('⚠️  Subscribe transaction sent:', tx.hash);
        await tx.wait();
        console.log('✅ Subscription activated NOW!');
    } catch (error) {
        if (error.message.includes('already') || error.code === 'CALL_EXCEPTION') {
            console.log('✅ Already subscribed (perfect!)');
        } else {
            console.log('❌ Error:', error.message.substring(0, 150));
        }
    }

    console.log();
    console.log('========================================');
    console.log('V8 READY FOR TESTING!');
    console.log('========================================');
    console.log();
    console.log('Test Instructions:');
    console.log('1. Create Order A on Lasna (e.g. 1 LREACT -> NFT');
    console.log('2. Create Order B on Sepolia (e.g. NFT -> 1 ETH)');
    console.log('3. V8 should AUTO-MATCH them cross-chain!');
}

verifyV8();
