import { ponder } from "ponder:registry";
import { Order, Swap } from "../ponder.schema";
import { eq } from "ponder"; // or drizzle-orm, but ponder exports it

ponder.on("OrderProcessor:OrderCreated", async ({ event, context }) => {
    await context.db.insert(Order).values({
        id: event.args.orderId,
        maker: event.args.maker,
        tokenIn: event.args.tokenIn,
        tokenOut: event.args.tokenOut,
        typeIn: BigInt(event.args.typeIn),
        typeOut: BigInt(event.args.typeOut),
        amountIn: event.args.amountIn,
        amountOut: event.args.amountOut,
        targetChainId: event.args.targetChainId,
        status: 0n, // Assume Active on creation
        filledAmount: 0n,
        timestamp: event.args.timestamp,
        txHash: event.transaction.hash,
    });
});

// Handle OrderExecuted (Partial or Full fills) - this covers both Swap/Match and Fulfill
ponder.on("WalletSwapMain:OrderExecuted", async ({ event, context }) => {
    // 1. Create Swap entity
    await context.db.insert(Swap).values({
        id: event.transaction.hash + "-" + event.log.logIndex,
        orderId: event.args.orderId,
        taker: event.args.taker,
        amountOut: event.args.amountOut,
        timestamp: event.args.timestamp,
        txHash: event.transaction.hash,
    });

    // 2. Update Order filledAmount
    // We need to fetch current order first to increment
    const order = await context.db.find(Order, { id: event.args.orderId });

    if (order) {
        const newFilled = (order.filledAmount || 0n) + event.args.amountOut;
        const isFilled = newFilled >= order.amountOut;

        await context.db.update(Order, { id: event.args.orderId }).set({
            filledAmount: newFilled,
            status: isFilled ? 1n : 2n, // 1=Filled, 2=PartiallyFilled
        });
    }
});

// Handle explicit OrderFilled (usually from manual fulfill)
ponder.on("OrderProcessor:OrderFilled", async ({ event, context }) => {
    // Defines explicit finalization
    await context.db.update(Order, { id: event.args.orderId }).set({
        status: 1n, // Filled
    });
});

ponder.on("OrderProcessor:OrderCancelled", async ({ event, context }) => {
    await context.db.update(Order, { id: event.args.orderId }).set({
        status: 3n, // Cancelled
    });
});
