import { createConfig } from "ponder";
import { http } from "viem";

import { WalletSwapMainAbi } from "./abis/WalletSwapMainAbi";
import { OrderProcessorAbi } from "./abis/OrderProcessorAbi";

// Debug logging
console.log("Loading Ponder Config...");
console.log("WalletSwapMainAbi present:", !!WalletSwapMainAbi);
console.log("OrderProcessorAbi present:", !!OrderProcessorAbi);
console.log("Env RPC 11155111:", process.env.PONDER_RPC_URL_11155111 ? "Found" : "Missing");

export default createConfig({
    chains: {
        sepolia: {
            id: 11155111,
            rpc: http(process.env.PONDER_RPC_URL_11155111 || "https://ethereum-sepolia-rpc.publicnode.com"),
        },
        polygonAmoy: {
            id: 80002,
            rpc: http(process.env.PONDER_RPC_URL_80002 || "https://polygon-amoy-bor-rpc.publicnode.com"),
        },
        mainnet: {
            id: 1,
            rpc: http(process.env.PONDER_RPC_URL_1 || "https://eth.merkle.io"),
        },
        polygon: {
            id: 137,
            rpc: http(process.env.PONDER_RPC_URL_137 || "https://polygon-rpc.com"),
        },
        lasna: {
            id: 5318007,
            rpc: http(process.env.PONDER_RPC_URL_5318007 || "https://lasna-rpc.rnk.dev/"),
        },
    },
    contracts: {
        WalletSwapMain: {
            abi: WalletSwapMainAbi,
            chain: {
                sepolia: {
                    address: "0x4a267C1b4926056932659577E6c2C7E15d4AFFEd",
                    startBlock: 7500000,
                },
                polygonAmoy: {
                    address: "0xAD18d2B0578388fc4078C1cd7037e7c05E04014C",
                    startBlock: 0,
                },
                lasna: {
                    address: "0x9b000cc149bd54846e7a039a15092759998814be",
                    startBlock: 0,
                }
            },
        },
        OrderProcessor: {
            abi: OrderProcessorAbi,
            chain: {
                sepolia: {
                    address: "0xc387Fd64F086D9ef48B25929c91115DEd24A3CEB",
                    startBlock: 7500000,
                },
                polygonAmoy: {
                    address: "0x74f793F9dA171F9aE8a4D2C8105379bF0227AC30",
                    startBlock: 0,
                },
                lasna: {
                    address: "0x7eb8fea9659f48b708b6d807d24127c48fb570a2",
                    startBlock: 0,
                }
            },
        },
    },
});



