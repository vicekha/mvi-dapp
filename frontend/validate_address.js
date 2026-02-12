import { ethers } from "ethers";
import fs from 'fs';

try {
    const raw = fs.readFileSync('v4_addr.txt', 'utf8').trim();
    console.log("RAW:", raw);
    console.log("LENGTH:", raw.length);

    if (raw.length > 42) {
        const possible = raw.substring(0, 42);
        try {
            console.log("TRUNCATED_CHECK:", ethers.getAddress(possible));
        } catch (e) { console.log("Truncated invalid"); }
    }

    try {
        const valid = ethers.getAddress(raw);
        console.log("VALID_CHECKSUMMED:", valid);
    } catch (e) {
        console.error("INVALID ADDRESS:", e.message);
    }

} catch (e) {
    console.error("Script Error:", e);
}
