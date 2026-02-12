
import { ethers } from "ethers";

const variants = [
    "OrderInitiated(bytes32,address,address,address,uint8,uint8,uint256,uint256,uint256,uint256)",
    "OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)",
    // Enum as explicit name? unlikely for standard solidity but possible in some versions
    "OrderInitiated(bytes32,address,address,address,enum AssetType,enum AssetType,uint256,uint256,uint256,uint256)",
    // Maybe it wasn't uint8 but uint256?
    "OrderInitiated(bytes32,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256)"
];

for (const sig of variants) {
    const topic = ethers.keccak256(ethers.toUtf8Bytes(sig));
    console.log(`Sig: ${sig}`);
    console.log(`Hash: ${topic}`);
    console.log('---');
}
