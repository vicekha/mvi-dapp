import { ethers } from 'ethers';

const sig = "OrderCreated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)";
const hash = ethers.id(sig);

console.log(`Signature: ${sig}`);
console.log(`Calculated Hash: ${hash}`);
console.log(`Contract Constant: 0xff3b90bd96f52c8b55369feccd230679a844f1ef26a3c3d8e47269f9aaf492f0`);
