import { ethers } from 'ethers';

async function testSubscribe() {
    const provider = new ethers.JsonRpcProvider(
        'https://lasna-rpc.rnk.dev/',
        { chainId: 5318007, name: 'lasna' },
        { staticNetwork: true }
    );

    const wallet = new ethers.Wallet(
        '0xbb8cceb0484d1f191da4cd5db14d24bf70dfed91f804af11970536c5237eb088',
        provider
    );

    const systemContractAddress = '0x0000000000000000000000000000000000fffFfF';
    const REACTIVE_IGNORE = '0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc147633133524a2411e96ccc';

    const abi = [
        'function subscribe(uint256 chain_id, address _contract, uint256 topic_0, uint256 topic_1, uint256 topic_2, uint256 topic_3) external'
    ];

    const systemContract = new ethers.Contract(systemContractAddress, abi, wallet);

    console.log('Testing subscribe() call...');
    console.log('From:', wallet.address);
    console.log('To:', systemContractAddress);
    console.log();

    try {
        // Try to call subscribe with test parameters
        const tx = await systemContract.subscribe(
            11155111, // Sepolia
            '0xDE2EbcBd01B7E0Aa9bfA9f503a7c6FFD4e0C91Dd', // Test contract
            '0xe9dbf214fbca4dcf24d24615419f220adcafd4dde8f1f7cce7bd1008287e7', // Test topic
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            REACTIVE_IGNORE,
            { gasLimit: 500000 }
        );

        console.log('✅ Transaction sent!', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Subscribe succeeded!');
        console.log('Gas used:', receipt.gasUsed.toString());

    } catch (error) {
        console.log('❌ Subscribe failed!');
        console.log();
        console.log('Error message:', error.message);
        console.log();

        if (error.data) {
            console.log('Error data:', error.data);
        }

        // Try to decode revert reason
        if (error.reason) {
            console.log('Revert reason:', error.reason);
        }
    }
}

testSubscribe();
