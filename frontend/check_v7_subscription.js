import { ethers } from 'ethers';

async function checkSubscriptionStatus() {
    const provider = new ethers.JsonRpcProvider(
        'https://lasna-rpc.rnk.dev/',
        { chainId: 5318007, name: 'lasna' },
        { staticNetwork: true }
    );

    const v7Address = '0xbea11017ba542bfaa9560d5cdf9825afb1ba9d73';
    const systemContract = '0x0000000000000000000000000000000000fffFfF';

    console.log('Checking V7 RSC Subscription Status...\n');

    // Get recent events/transactions to V7 contract
    const currentBlock = await provider.getBlockNumber();
    console.log('Current block:', currentBlock);

    // Try calling subscribe again to see if it reverts (already subscribed) or succeeds (not subscribed)
    const wallet = new ethers.Wallet(
        '0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088',
        provider
    );

    const REACTIVE_IGNORE = '0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc147633133524a2411e96ccc';
    const abi = [
        'function subscribe() external',
        'function originChainId() external view returns (uint256)',
        'function destinationChainId() external view returns (uint256)',
        'function walletSwapMain() external view returns (address)',
        'function destinationWalletSwapMain() external view returns (address)',
        'function owner() external view returns (address)'
    ];

    const rsc = new ethers.Contract(v7Address, abi, wallet);

    // Check configuration
    console.log('RSC Configuration:');
    const originChainId = await rsc.originChainId();
    const destChainId = await rsc.destinationChainId();
    const originContract = await rsc.walletSwapMain();
    const destContract = await rsc.destinationWalletSwapMain();
    const owner = await rsc.owner();

    console.log('  Origin Chain:', originChainId.toString(), '(Sepolia)');
    console.log('  Origin Contract:', originContract);
    console.log('  Dest Chain:', destChainId.toString(), '(Lasna)');
    console.log('  Dest Contract:', destContract);
    console.log('  Owner:', owner);
    console.log();

    // Try to subscribe again
    console.log('Testing subscribe() call...');
    try {
        const tx = await rsc.subscribe({ gasLimit: 1000000 });
        console.log('✅ Subscribe transaction sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Transaction confirmed!');
        console.log('This means the contract was NOT previously subscribed.');
        console.log('Auto-matching should work now!');
    } catch (error) {
        if (error.message.includes('already subscribed') || error.message.includes('duplicate')) {
            console.log('✅ Already subscribed (good!)');
        } else {
            console.log('❌ Subscribe failed:');
            console.log(error.message.substring(0, 200));
        }
    }
}

checkSubscriptionStatus();
