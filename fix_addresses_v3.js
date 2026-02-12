const fs = require('fs');
const { getAddress } = require('./frontend/node_modules/ethers');

const filePath = 'frontend/src/config/contracts.ts';
const content = fs.readFileSync(filePath, 'utf8');

// Thorough regex for hex addresses
const addrRegex = /0x[a-fA-F0-9]{40}/g;
let newContent = content;
const matches = content.match(addrRegex) || [];

console.log(`Found ${matches.length} addresses.`);

const uniqueMatches = [...new Set(matches)];
uniqueMatches.forEach(match => {
    try {
        const checksummed = getAddress(match);
        if (checksummed !== match) {
            console.log(`UPDATING: ${match} -> ${checksummed}`);
            // Use split/join for global replace of this specific string
            newContent = newContent.split(match).join(checksummed);
        } else {
            console.log(`OK: ${match}`);
        }
    } catch (e) {
        console.error(`ERROR: ${match} is not a valid address`);
    }
});

fs.writeFileSync(filePath, newContent);
console.log("Cleanup complete.");
