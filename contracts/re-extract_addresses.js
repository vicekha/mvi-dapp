const fs = require('fs');
const path = require('path');
const { getAddress } = require('ethers');

function extractAddresses(chainId) {
    const broadcastPath = path.join(__dirname, 'broadcast', 'DeployTestnet.s.sol', chainId.toString(), 'run-latest.json');
    if (!fs.existsSync(broadcastPath)) {
        console.log(`No broadcast for chain ${chainId}`);
        return null;
    }

    const data = JSON.parse(fs.readFileSync(broadcastPath, 'utf8'));
    const contracts = {};

    data.transactions.forEach(tx => {
        if (tx.transactionType === 'CREATE') {
            contracts[tx.contractName] = getAddress(tx.contractAddress);
        }
    });

    return contracts;
}

const chains = [5318007, 11155111, 80002, 31337];
const allContracts = {};

chains.forEach(id => {
    try {
        const contracts = extractAddresses(id);
        if (contracts) allContracts[id] = contracts;
    } catch (e) {
        // console.error(`Error for ${id}: ${e.message}`);
    }
});

console.log(JSON.stringify(allContracts, null, 2));
