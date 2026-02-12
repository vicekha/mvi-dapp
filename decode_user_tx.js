const ethers = require('ethers');

const data = "0x4077b1fd00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000384754fe5780cacafcfad6ebd383ae98e496e4800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002386f26fc100000000000000000000000000000000000000000000000000056bc75e2d63100000000000000000000000000000000000000000000000000000002386f26fc100000000000000000000000000000000000000000000000000056bc75e2d631000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001518000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000aa36a7";

const abi = [
    "function createOrder(address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId)"
];

const iface = new ethers.Interface(abi);
const decoded = iface.decodeFunctionData("createOrder", data);

console.log("tokenIn:", decoded[0]);
console.log("tokenOut:", decoded[1]);
console.log("typeIn:", decoded[2]);
console.log("typeOut:", decoded[3]);
console.log("amountIn:", decoded[4].toString());
console.log("amountOut:", decoded[5].toString());
console.log("minutesValueIn:", decoded[6].toString());
console.log("minutesValueOut:", decoded[7].toString());
console.log("slippageTolerance:", decoded[8].toString());
console.log("duration:", decoded[9].toString());
console.log("enableRebooking:", decoded[10]);
console.log("targetChainId:", decoded[11].toString());
