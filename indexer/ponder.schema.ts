import { onchainTable } from "ponder";

// Status enum removed to prevent build error

// Order entity
export const Order = onchainTable("Order", (t) => ({
    id: t.text().primaryKey(),
    maker: t.text(), // Address as text/hex
    tokenIn: t.text(),
    tokenOut: t.text(),
    amountIn: t.bigint(),
    amountOut: t.bigint(),
    typeIn: t.bigint(),
    typeOut: t.bigint(),
    targetChainId: t.bigint(),

    // Status tracking
    status: t.bigint(), // 0=Active, 1=Filled, 2=PartiallyFilled, 3=Cancelled
    filledAmount: t.bigint(),

    timestamp: t.bigint(),
    txHash: t.text(),
}));

// Swap/Match entity to track executions
export const Swap = onchainTable("Swap", (t) => ({
    id: t.text().primaryKey(), // txHash + logIndex
    orderId: t.text(),
    taker: t.text(),
    amountOut: t.bigint(), // Amount filled
    timestamp: t.bigint(),
    txHash: t.text(),
}));
