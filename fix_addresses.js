const fs = require('fs');
const { getAddress } = require('./frontend/node_modules/ethers');

const filePath = 'frontend/src/config/contracts.ts';
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Regex for ethereum addresses (0x followed by 40 hex chars)
const addrRegex = /0x[a-fA-F0-9]{40}/g;
let count = 0;
content = content.replace(addrRegex, (match) => {
    try {
        const checksummed = getAddress(match);
        if (checksummed !== match) {
            console.log(`Updated: ${match} -> ${checksummed}`);
            count++;
        }
        return checksummed;
    } catch (e) {
        console.error(`Invalid address found: ${match}`);
        return match;
    }
});

fs.writeFileSync(filePath, content);
console.log(`Successfully updated ${count} addresses in contracts.ts`);
