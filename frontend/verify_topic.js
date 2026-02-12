
import { ethers } from "ethers";

const signature = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)";
const topic = ethers.keccak256(ethers.toUtf8Bytes(signature));

console.log(`Signature: ${signature}`);
console.log(`Topic: ${topic}`);
