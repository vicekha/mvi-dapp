const { parseAbi } = require("viem");

const WalletSwapMainAbi = parseAbi([
    "event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)",
    "event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp)"
]);

const OrderProcessorAbi = parseAbi([
    "event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 targetChainId, uint256 timestamp)",
    "event OrderFilled(bytes32 indexed orderId, uint256 amountOut, uint256 timestamp)",
    "event OrderCancelled(bytes32 indexed orderId, string reason, uint256 timestamp)",
    "function orders(bytes32 orderId) view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)"
]);

const CONFIG = {
    sepolia: {
        id: 11155111,
        rpc: "https://ethereum-sepolia-rpc.publicnode.com",
        WalletSwapMain: "0x4a267C1b4926056932659577E6c2C7E15d4AFFEd",
        OrderProcessor: "0xc387Fd64F086D9ef48B25929c91115DEd24A3CEB",
        startBlock: 7500000n
    },
    polygonAmoy: {
        id: 80002,
        rpc: "https://polygon-amoy-bor-rpc.publicnode.com",
        WalletSwapMain: "0xAD18d2B0578388fc4078C1cd7037e7c05E04014C",
        OrderProcessor: "0x74f793F9dA171F9aE8a4D2C8105379bF0227AC30",
        startBlock: 16000000n // approx recent block 
    },
    lasna: {
        id: 5318007,
        rpc: "https://lasna-rpc.rnk.dev/",
        WalletSwapMain: "0x9b000cc149bd54846e7a039a15092759998814be",
        OrderProcessor: "0x7eb8fea9659f48b708b6d807d24127c48fb570a2",
        startBlock: 2200000n
    }
};

module.exports = { WalletSwapMainAbi, OrderProcessorAbi, CONFIG };
