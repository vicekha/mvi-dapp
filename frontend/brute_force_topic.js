
import { ethers } from "ethers";

const target = "0x4cffe4d53be4a3534a"; // Prefix

const base = "OrderInitiated";
const types = [
    ["bytes32", "address", "address", "address"], // Fixed start
    ["uint8", "uint8"], // Enums?
    ["uint256", "uint256", "uint256", "uint256"] // Amounts + target + timestamp
];

// permutations of enum types
const enumTypes = ["uint8", "uint256", "uint", "int", "int8"];

function check(str) {
    const hash = ethers.keccak256(ethers.toUtf8Bytes(str));
    if (hash.startsWith(target)) {
        console.log(`MATCH FOUND: ${str}`);
        console.log(`Hash: ${hash}`);
    }
}

// 1. Standard
check("OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)");
check("OrderInitiated(bytes32,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256)");

// 2. Maybe AssetType is treated as user type?
check("OrderInitiated(bytes32,address,address,address,AssetType,AssetType,uint256,uint256,uint256,uint256)");

// 3. Maybe I missed an arg? Or too many?
// Check OrderCreated from Processor? No, OrderInitiated.

console.log("Checking variants...");
