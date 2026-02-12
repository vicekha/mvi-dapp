import { ethers } from "ethers";

const addr = "0x85592799782Eb52f5faa2b86711837faC674F9bE3";
console.log("Input:", addr);
console.log("Length:", addr.length);

try {
    const valid = ethers.getAddress(addr);
    console.log("VALID:", valid);
} catch (e) {
    console.log("INVALID:", e.message);
    // Try to recover if it's a truncation issue (42 chars + 1?)
    if (addr.length > 42) {
        console.log("Trying substring(0,42):");
        try {
            console.log("FIXED:", ethers.getAddress(addr.substring(0, 42)));
        } catch (e2) { console.log("FIX FAILED"); }
    }
}
