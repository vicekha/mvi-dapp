import { ethers } from 'ethers';

async function checkSystemContract() {
    const provider = new ethers.JsonRpcProvider(
        'https://lasna-rpc.rnk.dev/',
        { chainId: 5318007, name: 'lasna' },
        { staticNetwork: true }
    );

    const systemContractAddress = '0x0000000000000000000000000000000000fffFfF';

    console.log('Checking System Contract on Lasna...');
    console.log('Address:', systemContractAddress);
    console.log();

    try {
        // Check if contract has code
        const code = await provider.getCode(systemContractAddress);

        if (code === '0x') {
            console.log('❌ NO CODE DEPLOYED');
            console.log('The system contract does not exist at this address on Lasna testnet.');
            console.log('This explains why subscribe() calls are reverting!');
        } else {
            console.log('✅ Contract exists!');
            console.log('Code length:', code.length, 'characters');
            console.log('First 100 chars:', code.substring(0, 100));
        }

        // Also check balance
        const balance = await provider.getBalance(systemContractAddress);
        console.log();
        console.log('Contract balance:', ethers.formatEther(balance), 'LREACT');

    } catch (error) {
        console.error('Error checking contract:', error.message);
    }
}

checkSystemContract();
