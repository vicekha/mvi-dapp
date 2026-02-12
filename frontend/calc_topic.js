import { ethers } from 'ethers';

const eventSignature = "OrderCreated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)";
const hash = ethers.id(eventSignature);

console.log(`Signature: ${eventSignature}`);
console.log(`Hash: ${hash}`);

const expected = "0xff3b90bd96f52c8b55369feccd230679a844f1ef26a3c3d8e47269f9aaf492f0";
console.log(`Matches expected? ${hash === expected}`);
