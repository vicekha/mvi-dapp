const { ethers } = require('ethers');

const orderInitiatedSig = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256)";
const callbackSig = "CrossChainCallbackCreated(bytes32,bytes32,uint256,uint256)";

const hash1 = ethers.keccak256(ethers.toUtf8Bytes(orderInitiatedSig));
const hash2 = ethers.keccak256(ethers.toUtf8Bytes(callbackSig));

console.log("OrderInitiated Topic:", hash1);
console.log("CrossChainCallbackCreated Topic:", hash2);
