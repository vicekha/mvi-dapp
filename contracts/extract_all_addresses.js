const fs = require('fs');

// Read Sepolia deployment
const sepoliaData = JSON.parse(fs.readFileSync('./broadcast/DeployTestnet.s.sol/11155111/run-latest.json', 'utf8'));
const lasnaData = JSON.parse(fs.readFileSync('./broadcast/DeployTestnet.s.sol/5318007/run-latest.json', 'utf8'));

console.log('\n=== SEPOLIA (11155111) ===');
sepoliaData.transactions
    .filter(tx => tx.transactionType === 'CREATE')
    .forEach(tx => {
        console.log(`${tx.contractName}: ${tx.contractAddress}`);
    });

console.log('\n=== LASNA (5318007) ===');
lasnaData.transactions
    .filter(tx => tx.transactionType === 'CREATE')
    .forEach(tx => {
        console.log(`${tx.contractName}: ${tx.contractAddress}`);
    });
