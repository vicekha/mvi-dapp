const { ethers } = require("ethers");

const topic = ethers.id("CrossChainCallbackCreated(bytes32,bytes32,uint256,uint256)");
console.log("Calculated Topic:", topic);
console.log("Expected (RSC):", "0x9c3d9354050720455dbd743322d9990924707248f2174301548cd1835616f737");
if (topic === "0x9c3d9354050720455dbd743322d9990924707248f2174301548cd1835616f737") {
    console.log("MATCH");
} else {
    console.log("MISMATCH");
}
