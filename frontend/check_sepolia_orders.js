import { ethers } from "ethers";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
// Sepolia Contract Addresses
const ORDER_PROCESSOR = "0x8c7c2c9993c5eaf5db3d1a926278cbe0686bfe45";

const OLD_ABI = [
    "function orders(bytes32 orderId) external view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)",
    "function getOrderCount() external view returns (uint256)",
    "function orderIds(uint256) external view returns (bytes32)"
];

const NEW_ABI = [
    "function orders(bytes32 orderId) external view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)",
    "function orderIds(uint256) external view returns (bytes32)",
    "function getOrderCount() external view returns (uint256)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    console.log("Connected to Sepolia");

    const contract = new ethers.Contract(ORDER_PROCESSOR, NEW_ABI, provider);

    try {
        const count = await contract.getOrderCount();
        console.log(`Total Orders: ${count}`);

        if (count === 0n) {
            console.log("No orders found.");
            return;
        }

        const statusLabels = ["ACTIVE", "FILLED", "PARTIALLY_FILLED", "CANCELLED", "EXPIRED"];

        // Check last 5 orders
        const start = count > 5n ? count - 5n : 0n;
        for (let i = count - 1n; i >= start; i--) {
            const id = await contract.orderIds(i);
            const order = await contract.orders(id);
            console.log(`\nOrder [${i}] ID: ${id}`);
            console.log(`  Maker: ${order.maker}`);
            console.log(`  TokenIn: ${order.tokenIn}`);
            console.log(`  TokenOut: ${order.tokenOut}`);
            console.log(`  AmountIn: ${ethers.formatEther(order.amountIn)}`);
            console.log(`  AmountOut: ${ethers.formatEther(order.amountOut)}`);
            console.log(`  Status: ${order.status} (${statusLabels[order.status] || 'UNKNOWN'})`);
            console.log(`  Created: ${new Date(Number(order.timestamp) * 1000).toLocaleString()}`);
            console.log(`  Expiration: ${new Date(Number(order.expiration) * 1000).toLocaleString()}`);
            console.log(`  TargetChainId: ${order.targetChainId.toString()}`);
        }

    } catch (e) {
        console.error("Error fetching orders:", e);
    }
}

main();
