const fs = require('fs');
const { ethers } = require("ethers");

try {
    let raw = fs.readFileSync('v4_addr.txt', 'utf8').trim();
    console.log("RAW:", raw);
    console.log("LENGTH:", raw.length);

    // Attempt to fix if it's off by one char (e.g. 43 chars)
    if (raw.length > 42) {
        // Maybe take first 42?
        let possible = raw.substring(0, 42);
        try {
            console.log("TRUNCATED_CHECK:", ethers.getAddress(possible));
        } catch (e) { console.log("Truncated invalid"); }
    }

    try {
        const valid = ethers.getAddress(raw);
        console.log("VALID_CHECKSUMMED:", valid);
    } catch (e) {
        console.error("INVALID ADDRESS:", e.message);
        // Try to find ANY 42-char hex string in the file or log if this one is bad
    }

} catch (e) {
    console.error("Script Error:", e);
}
