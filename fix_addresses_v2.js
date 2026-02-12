const fs = require('fs');
const { getAddress } = require('./frontend/node_modules/ethers');

const filePath = 'frontend/src/config/contracts.ts';
let content = fs.readFileSync(filePath, 'utf8');

const addrRegex = /0x[a-fA-F0-9]{40}/g;
content = content.replace(addrRegex, (match) => {
    const checksummed = getAddress(match);
    if (checksummed !== match) {
        console.log(`FIXED: ${match} -> ${checksummed}`);
    }
    return checksummed;
});

fs.writeFileSync(filePath, content);
console.log("Cleanup complete.");
