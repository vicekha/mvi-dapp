const { ethers } = require('ethers');

const orderInitiatedSig = "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256)";
const callbackCreatedSig = "CrossChainCallbackCreated(bytes32,bytes32,uint256,uint256)";

console.log("OrderInitiated Topic 0:", ethers.id(orderInitiatedSig));
console.log("CrossChainCallbackCreated Topic 0:", ethers.id(callbackCreatedSig));
