import { ethers } from "ethers";

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const TX_HASH = "0x6778d758bbc3bb12f883df58a9ae6d0e893099fdcdf9b03831951f280d466690"; // Sepolia TX

const ABI = [
    "event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 timestamp)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    console.log(`Fetching Sepolia TX: ${TX_HASH}...`);

    // Check if connected
    const net = await provider.getNetwork();
    console.log(`Connected to chain: ${net.chainId}`);

    const receipt = await provider.getTransactionReceipt(TX_HASH);
    if (!receipt) {
        console.error("Transaction not found or pending.");
        return;
    }

    console.log(`Status: ${receipt.status === 1 ? "Success" : "Failed"}`);

    const iface = new ethers.Interface(ABI);

    receipt.logs.forEach((log, index) => {
        try {
            const parsed = iface.parseLog(log);
            if (parsed) {
                console.log("  Parsed Event: OrderCreated");
                console.log(`    OrderId: ${parsed.args.orderId}`);
                console.log(`    TokenIn: ${parsed.args.tokenIn}`);
                console.log(`    TokenOut: ${parsed.args.tokenOut}`);
                console.log(`    AmountIn: ${ethers.formatEther(parsed.args.amountIn)}`);
                console.log(`    AmountOut: ${ethers.formatEther(parsed.args.amountOut)}`);
            }
        } catch (e) {
            // Ignore other events
        }
    });
}

main().catch(console.error);
