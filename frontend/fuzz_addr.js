import { ethers } from "ethers";

const raw = "0x85592799782eb52f5faa2b86711837fac674f9be3";
console.log("Raw:", raw);
console.log("Len:", raw.length);

try {
    console.log("Raw Valid:", ethers.getAddress(raw));
} catch (e) { console.log("Raw Invalid"); }

// Try removing last char
const trim1 = raw.substring(0, raw.length - 1);
console.log("Trim1:", trim1, "Len:", trim1.length);
try {
    console.log("Trim1 Valid:", ethers.getAddress(trim1));
} catch (e) { console.log("Trim1 Invalid"); }

// Try removing 0 from 0x? No.
// Try removing first hex digit (maybe it was 0x8... and 8 is garbage?)
const dropFirst = "0x" + raw.substring(3);
console.log("DropFirst:", dropFirst, "Len:", dropFirst.length);
try {
    console.log("DropFirst Valid:", ethers.getAddress(dropFirst));
} catch (e) { console.log("DropFirst Invalid"); }
