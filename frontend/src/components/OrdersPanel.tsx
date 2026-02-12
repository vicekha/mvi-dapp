import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../store/useWeb3';
import { CONTRACTS, ABIS, TOKENS, AssetType, CHAINS } from '../config/contracts';
import { Loader2, RefreshCw, Zap, Search, BarChart3, List } from 'lucide-react';
import { toast } from 'sonner';

// Order status enum matching the contract
enum OrderStatus {
    ACTIVE = 0,
    FILLED = 1,
    PARTIALLY_FILLED = 2,
    CANCELLED = 3,
    EXPIRED = 4
}

const statusLabels: Record<OrderStatus, { label: string; color: string }> = {
    [OrderStatus.ACTIVE]: { label: 'Active', color: '#22c55e' },
    [OrderStatus.PARTIALLY_FILLED]: { label: 'Partial', color: '#eab308' },
    [OrderStatus.FILLED]: { label: 'Filled', color: '#3b82f6' },
    [OrderStatus.CANCELLED]: { label: 'Cancelled', color: '#ef4444' },
    [OrderStatus.EXPIRED]: { label: 'Expired', color: '#6b7280' }
};

interface Order {
    id: string;
    maker: string;
    tokenIn: string;
    tokenOut: string;
    typeIn: number;
    typeOut: number;
    amountIn: bigint;
    amountOut: bigint;
    filledAmount: bigint; // Amount already filled (for partial fills)
    expiration: bigint;
    status: OrderStatus;
    targetChainId: bigint;
    timestamp: bigint;
}

export default function OrdersPanel() {
    const { address, chainId, signer, provider } = useWeb3();

    const [myOrders, setMyOrders] = useState<Order[]>([]);
    const [marketOrders, setMarketOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);

    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'my' | 'market' | 'bridge'>('my');
    const [bridgeOrders, setBridgeOrders] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');
    const [matchingIds, setMatchingIds] = useState<{ [key: string]: boolean }>({});

    const tokens = chainId ? TOKENS[chainId] || [] : [];
    const contracts = chainId ? CONTRACTS[chainId] : null;
    const currentBlockTime = Math.floor(Date.now() / 1000); // Failback if no block time

    const fetchOrders = useCallback(async () => {
        if (!chainId || !contracts || !contracts.ORDER_PROCESSOR) return;

        setLoading(true);
        try {
            // Use a direct RPC provider for reliability (MetaMask RPC can be unstable)
            const chainConfig = CHAINS[chainId];
            const directProvider = chainConfig?.rpc ? new ethers.JsonRpcProvider(chainConfig.rpc) : provider;
            if (!directProvider) return;

            const orderProcessor = new ethers.Contract(
                contracts.ORDER_PROCESSOR,
                ABIS.ORDER_PROCESSOR,
                directProvider
            );

            // Fetch all OrderCreated events
            // Use a smaller lookback window for Base Sepolia (RPC limits prevent large queries)
            const currentBlock = await directProvider.getBlockNumber();
            const lookback = chainId === 84532 ? 5000 : 100000; // Base Sepolia has stricter RPC limits

            let fromBlock = CHAINS[chainId]?.startBlock || 0;
            if (fromBlock === 0 && currentBlock > lookback) {
                fromBlock = currentBlock - lookback;
            }

            // event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 targetChainId, uint256 timestamp)
            const createdFilter = orderProcessor.filters.OrderCreated();
            const logs = await orderProcessor.queryFilter(createdFilter, fromBlock);



            // We need to check current status for each order, as events only tell us creation
            // We can use a multicall here if available, but for now we'll do parallel promises

            // Process basic info from events first
            const orderPromises = logs.map(async (log: any) => {
                try {
                    const parsedLog = orderProcessor.interface.parseLog(log);
                    if (!parsedLog) return null;

                    const args = parsedLog.args;
                    const orderId = args.orderId;

                    // Fetch current on-chain state
                    const orderData = await orderProcessor.orders(orderId);

                    return {
                        id: orderId,
                        maker: args.maker, // from event (indexed)
                        tokenIn: args.tokenIn, // from event (indexed)
                        tokenOut: args.tokenOut,
                        typeIn: Number(args.typeIn),
                        typeOut: Number(args.typeOut),
                        amountIn: BigInt(args.amountIn),
                        amountOut: BigInt(args.amountOut),
                        filledAmount: BigInt(orderData.filledAmount), // current state
                        expiration: BigInt(orderData.expiration), // current state (could extend)
                        status: Number(orderData.status), // current state
                        targetChainId: BigInt(args.targetChainId),
                        timestamp: BigInt(args.timestamp)
                    } as Order;
                } catch (err) {
                    console.error("Error processing order log:", err);
                    return null;
                }
            });

            const results = await Promise.all(orderPromises);
            const validOrders = results.filter((o): o is Order => o !== null);

            // Separate My Orders vs Market Orders
            // Market Orders: Orders that are relevant to THIS chain either as source or target
            // Actually, we are connected to one chain. We see orders created ON THIS CHAIN.
            // But we might also want to display orders that are "cross-chain" intended for other chains?
            // The original GraphQL query for market orders filtered by `targetChainId`.

            // Logic:
            // "My Orders": Created by me.
            const mine = validOrders.filter(o =>
                o.maker.toLowerCase() === address?.toLowerCase()
            );

            // "Market Orders": 
            // - Active or Partially Filled
            // - Not made by me (optional, but usually market excludes own) - keeping own is fine for visibility
            // - targetChainId check?
            // Original: where { targetChainId: $targetChainId } (meaning orders intended for THIS chain)
            // But wait, if I am on Sepolia, I want to see orders on Sepolia that are intended for Lasna? 
            // Or orders on Sepolia intended for Sepolia?
            // The logic: `targetChainId: chainId` in GraphQL meant "Orders where targetChainId matches current chainId"?
            // No, the variable passed was `targetChainId: chainId`.
            // So it fetched orders created (somewhere? likely strictly on the indexer's chain) that target THIS chain.

            // Here, we are querying the contract ON THIS CHAIN.
            // So we see orders created ON THIS CHAIN.
            // If an order is created on Sepolia with target Lasna, it lives on Sepolia.
            // If I am on Sepolia, I see it.
            // The "Market" usually shows what I can fill.
            // If I am on Sepolia, I can fill orders created on Sepolia (target=Sepolia or All).
            // I cannot "fill" an order created on Lasna while I am on Sepolia (unless I bridge first).
            // So, simply showing all active orders on the current chain is appropriate.

            const market = validOrders.filter(o => {
                // Should show active/partial
                // And expiration > now
                const isActive = (o.status === OrderStatus.ACTIVE || o.status === OrderStatus.PARTIALLY_FILLED);
                const isNotExpired = Number(o.expiration) > currentBlockTime;

                // If it is my order, maybe exclude from market view? Usually yes.
                // const isNotMine = o.maker.toLowerCase() !== address?.toLowerCase();

                return isActive && isNotExpired;
            }).sort((a, b) => Number(b.timestamp - a.timestamp));

            setMyOrders(mine.sort((a, b) => Number(b.timestamp - a.timestamp)));
            setMarketOrders(market);

        } catch (err) {
            console.error("Error fetching orders:", err);
            toast.error("Failed to fetch orders from RPC");
        } finally {
            setLoading(false);
        }
    }, [chainId, provider, address, contracts, currentBlockTime]);

    const fetchBridgeOrders = useCallback(async () => {
        if (!chainId || !contracts || !contracts.BRIDGE_SWAP_MAIN) return;

        try {
            const chainConfig = CHAINS[chainId];
            const directProvider = chainConfig?.rpc ? new ethers.JsonRpcProvider(chainConfig.rpc) : provider;
            if (!directProvider) return;

            const bridge = new ethers.Contract(
                contracts.BRIDGE_SWAP_MAIN,
                ABIS.BRIDGE_SWAP_MAIN,
                directProvider
            );

            const currentBlock = await directProvider.getBlockNumber();
            const fromBlock = currentBlock > 5000 ? currentBlock - 5000 : 0;

            const filter = bridge.filters.BridgeSwapRequested(null, address);
            const logs = await bridge.queryFilter(filter, fromBlock);

            const orders = await Promise.all(logs.map(async (log: any) => {
                const parsed = bridge.interface.parseLog(log);
                if (!parsed) return null;
                const args = parsed.args;

                // Check for execution event
                const executedFilter = bridge.filters.BridgeSwapExecuted(args.orderId);
                const executedLogs = await bridge.queryFilter(executedFilter, fromBlock);
                const isExecuted = executedLogs.length > 0;

                return {
                    id: args.orderId,
                    maker: args.maker,
                    tokenIn: args.tokenIn,
                    tokenOut: args.tokenOut,
                    amountIn: args.amountIn,
                    targetChainId: args.targetChainId,
                    timestamp: args.timestamp,
                    status: isExecuted ? 'Executed' : 'Requested'
                };
            }));

            setBridgeOrders(orders.filter(o => o !== null).sort((a, b) => Number(b.timestamp - a.timestamp)));
        } catch (err) {
            console.error("Error fetching bridge orders:", err);
        }
    }, [chainId, provider, address, contracts]);

    useEffect(() => {
        fetchOrders();
        fetchBridgeOrders();
    }, [fetchOrders, fetchBridgeOrders]);

    const displayOrders = activeTab === 'my' ? myOrders : marketOrders;

    const getTokenSymbol = (tokenAddress: string, assetType: number, tokenChainId?: number): string => {
        const effectiveChainId = tokenChainId || chainId;
        if (tokenAddress === ethers.ZeroAddress) {
            return CHAINS[effectiveChainId || 0]?.nativeCurrency?.symbol || 'ETH';
        }
        const tokensForChain = effectiveChainId ? TOKENS[effectiveChainId] || [] : [];
        const token = tokensForChain.find(t =>
            t.address.toLowerCase() === tokenAddress.toLowerCase()
        );
        return token?.symbol || (assetType === AssetType.ERC721 ? 'NFT' : 'TOKEN');
    };

    const formatAmount = (amount: bigint, tokenAddress: string, assetType: number): string => {
        if (assetType === AssetType.ERC721) {
            return `#${amount.toString()}`;
        }
        const token = tokens.find(t =>
            t.address.toLowerCase() === tokenAddress.toLowerCase()
        );
        const decimals = token?.decimals ?? 18;
        return parseFloat(ethers.formatUnits(amount, decimals)).toFixed(4);
    };

    const findMatch = (myOrder: Order): Order | undefined => {
        return marketOrders.find((other: Order) =>
            other.id !== myOrder.id &&
            other.tokenIn.toLowerCase() === myOrder.tokenOut.toLowerCase() &&
            other.tokenOut.toLowerCase() === myOrder.tokenIn.toLowerCase() &&
            (other.status === OrderStatus.ACTIVE || other.status === OrderStatus.PARTIALLY_FILLED) &&
            other.amountIn >= myOrder.amountOut &&
            myOrder.amountIn >= other.amountOut &&
            // Chain compatibility
            (myOrder.targetChainId === BigInt(0) || myOrder.targetChainId === BigInt(chainId || 0)) &&
            (other.targetChainId === BigInt(0) || other.targetChainId === BigInt(chainId || 0))
        );
    };

    const handleCancelOrder = async (orderId: string) => {
        if (!signer || !contracts) return;

        setCancellingId(orderId);
        try {
            const walletSwapMain = new ethers.Contract(
                contracts.WALLET_SWAP_MAIN,
                ABIS.WALLET_SWAP_MAIN,
                signer
            );

            const tx = await walletSwapMain.cancelOrder(orderId);
            await tx.wait();

            toast.success('Order cancelled successfully!');
            fetchOrders();
        } catch (err) {
            console.error('Cancel error:', err);
            const message = (err as { reason?: string; message?: string }).reason || (err as Error).message;
            toast.error(message);
        } finally {
            setCancellingId(null);
        }
    };

    const handleMatchOrders = async (myOrderId: string, marketOrderId: string) => {
        if (!signer || !contracts) return;

        setMatchingIds(prev => ({ ...prev, [marketOrderId]: true }));
        try {
            const walletSwapMain = new ethers.Contract(
                contracts.WALLET_SWAP_MAIN,
                ABIS.WALLET_SWAP_MAIN,
                signer
            );

            const tx = await walletSwapMain.matchOrders(myOrderId, marketOrderId);
            await tx.wait();

            toast.success('Orders matched and swapped successfully!');
            fetchOrders();
        } catch (err) {
            console.error('Match error:', err);
            const message = (err as { reason?: string; message?: string }).reason || (err as Error).message;
            toast.error(message);
        } finally {
            setMatchingIds(prev => ({ ...prev, [marketOrderId]: false }));
        }
    };

    const canCancel = (status: OrderStatus): boolean => {
        return status === OrderStatus.ACTIVE || status === OrderStatus.PARTIALLY_FILLED;
    };

    const handleRefresh = async () => {
        await fetchOrders();
        toast.success("Orders refreshed");
    };

    if (!address) {
        return null;
    }

    const filteredOrders = displayOrders.filter((order: Order) => {
        if (!searchQuery) return true;

        const query = searchQuery.toLowerCase();
        const symbolIn = getTokenSymbol(order.tokenIn, order.typeIn).toLowerCase();
        const symbolOut = getTokenSymbol(order.tokenOut, order.typeOut, Number(order.targetChainId) || chainId || undefined).toLowerCase();
        const maker = order.maker.toLowerCase();

        return (
            symbolIn.includes(query) ||
            symbolOut.includes(query) ||
            maker.includes(query) ||
            order.id.toLowerCase().includes(query)
        );
    });

    return (
        <div className="card" style={{ maxWidth: '640px', margin: '2rem auto 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            className={`btn ${activeTab === 'my' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('my')}
                            style={{ padding: '0.5rem 1rem' }}
                        >
                            My Orders
                        </button>
                        <button
                            className={`btn ${activeTab === 'market' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('market')}
                            style={{ padding: '0.5rem 1rem' }}
                        >
                            Marketplace
                        </button>
                        <button
                            className={`btn ${activeTab === 'bridge' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setActiveTab('bridge')}
                            style={{ padding: '0.5rem 1rem' }}
                        >
                            Bridge
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {activeTab === 'market' && (
                            <button
                                className="btn btn-secondary"
                                onClick={() => setViewMode(viewMode === 'list' ? 'chart' : 'list')}
                                style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                title={viewMode === 'list' ? "Switch to Chart View" : "Switch to List View"}
                            >
                                {viewMode === 'list' ? <BarChart3 size={16} /> : <List size={16} />}
                            </button>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={handleRefresh}
                            disabled={loading}
                            style={{ padding: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Search Input - only for list view */}
                {viewMode === 'list' && (
                    <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                            <Search size={16} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search by token symbol or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input"
                            style={{
                                width: '100%',
                                paddingLeft: '2.5rem',
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderColor: 'rgba(255, 255, 255, 0.1)'
                            }}
                        />
                    </div>
                )}
            </div>

            {viewMode === 'chart' && activeTab === 'market' ? (
                // Chart View
                <div style={{ minHeight: '300px' }}>
                    <div style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Virtual Liquidity Depth
                    </div>
                    {marketOrders.length > 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Market depth visualization is temporarily disabled due to a build conflict with the charting library.
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No active orders to visualize.
                        </div>
                    )}
                </div>
            ) : activeTab === 'bridge' ? (
                /* Bridge Orders Tab */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {bridgeOrders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            No bridge transactions found.
                        </div>
                    ) : (
                        bridgeOrders.map((order) => (
                            <div
                                key={order.id}
                                style={{
                                    background: 'rgba(139, 92, 246, 0.05)',
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    borderRadius: '12px',
                                    padding: '1rem',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <span style={{
                                        background: order.status === 'Executed' ? '#22c55e' : '#8b5cf6',
                                        color: '#fff',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 700
                                    }}>
                                        {order.status.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '10px', color: '#999' }}>
                                        {new Date(Number(order.timestamp) * 1000).toLocaleString()}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                                    <div style={{ flex: 1, textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600 }}>{formatAmount(order.amountIn, order.tokenIn, AssetType.ERC20)}</div>
                                        <div style={{ fontSize: '12px', color: '#999' }}>{getTokenSymbol(order.tokenIn, AssetType.ERC20)}</div>
                                    </div>
                                    <div style={{ color: '#8b5cf6' }}>→</div>
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                        <div style={{ fontWeight: 600 }}>{formatAmount(order.amountIn, order.tokenOut, AssetType.ERC20)}</div>
                                        <div style={{ fontSize: '12px', color: '#999' }}>{getTokenSymbol(order.tokenOut, AssetType.ERC20, Number(order.targetChainId))}</div>
                                    </div>
                                </div>
                                <div style={{ marginTop: '0.5rem', fontSize: '10px', color: '#666', textAlign: 'center' }}>
                                    Target: {CHAINS[Number(order.targetChainId)]?.name || 'Unknown'}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* My/Market List View */
                loading && filteredOrders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem' }} />
                        Loading orders...
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-emerald-900/40 rounded-xl bg-[#0a0f0f]/30">
                        <div className="inline-flex p-3 rounded-full bg-emerald-900/20 mb-3">
                            <List className="w-6 h-6 text-emerald-500/50" />
                        </div>
                        <p className="text-emerald-500/60 font-medium">No orders found</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filteredOrders.map((order: Order) => {
                            const { label, color } = statusLabels[order.status] || statusLabels[OrderStatus.ACTIVE];
                            const isExpired = Number(order.expiration) < currentBlockTime;

                            let match: Order | undefined;
                            if (activeTab === 'my') {
                                match = order.status === OrderStatus.ACTIVE && !isExpired ? findMatch(order) : undefined;
                            } else {
                                match = myOrders.find((myOrder: Order) =>
                                    myOrder.status === OrderStatus.ACTIVE &&
                                    myOrder.tokenOut.toLowerCase() === order.tokenIn.toLowerCase() &&
                                    myOrder.amountIn >= order.amountOut &&
                                    order.amountIn >= myOrder.amountOut &&
                                    (myOrder.targetChainId === BigInt(0) || myOrder.targetChainId === BigInt(chainId || 0)) &&
                                    (order.targetChainId === BigInt(0) || order.targetChainId === BigInt(chainId || 0))
                                );
                            }

                            return (
                                <div
                                    key={order.id}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        padding: '1rem',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span
                                                style={{
                                                    background: color,
                                                    color: '#fff',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600
                                                }}
                                            >
                                                {isExpired && order.status === OrderStatus.ACTIVE ? 'Expired' : label}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {order.maker.toLowerCase() === address.toLowerCase() ? 'You' : `${order.maker.slice(0, 6)}...${order.maker.slice(-4)}`}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {match && activeTab === 'market' && (
                                                <button
                                                    className="btn btn-primary"
                                                    onClick={() => handleMatchOrders(match!.id, order.id)}
                                                    disabled={matchingIds[order.id]}
                                                    style={{
                                                        padding: '0.25rem 0.75rem',
                                                        fontSize: '0.75rem',
                                                        background: 'rgba(34, 197, 94, 0.2)',
                                                        borderColor: 'rgba(34, 197, 94, 0.4)',
                                                        color: '#22c55e',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)')}
                                                >
                                                    {matchingIds[order.id] ? (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Zap size={12} fill="currentColor" />
                                                            Instant Swap
                                                        </>
                                                    )}
                                                </button>
                                            )}

                                            {activeTab === 'my' && canCancel(order.status) && !isExpired && (
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={() => handleCancelOrder(order.id)}
                                                    disabled={cancellingId === order.id}
                                                    style={{
                                                        padding: '0.25rem 0.75rem',
                                                        fontSize: '0.75rem',
                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                        borderColor: 'rgba(239, 68, 68, 0.3)',
                                                        color: '#ef4444'
                                                    }}
                                                >
                                                    {cancellingId === order.id ? <Loader2 size={12} className="animate-spin" /> : 'Cancel'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ flex: 1, textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                                                {/* Show remaining amountIn for partial fills */}
                                                {order.filledAmount > 0n ? (
                                                    <>
                                                        <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '0.9rem' }}>
                                                            {formatAmount(order.amountIn, order.tokenIn, order.typeIn)}
                                                        </span>
                                                        {' '}
                                                        <span style={{ color: '#22c55e' }}>
                                                            {formatAmount(
                                                                order.amountOut > 0n
                                                                    ? BigInt((order.amountIn * (order.amountOut - order.filledAmount)) / order.amountOut)
                                                                    : 0n,
                                                                order.tokenIn,
                                                                order.typeIn
                                                            )}
                                                        </span>
                                                    </>
                                                ) : (
                                                    formatAmount(order.amountIn, order.tokenIn, order.typeIn)
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                {getTokenSymbol(order.tokenIn, order.typeIn)}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                on {CHAINS[chainId || 0]?.name || 'Unknown'}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                            <div style={{ color: 'var(--primary)', fontSize: '1.5rem' }}>→</div>
                                        </div>

                                        <div style={{ flex: 1, textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                                                {/* Show remaining amountOut for partial fills */}
                                                {order.filledAmount > 0n ? (
                                                    <>
                                                        <span style={{ textDecoration: 'line-through', opacity: 0.5, fontSize: '0.9rem' }}>
                                                            {formatAmount(order.amountOut, order.tokenOut, order.typeOut)}
                                                        </span>
                                                        {' '}
                                                        <span style={{ color: '#22c55e' }}>
                                                            {formatAmount(BigInt(order.amountOut - order.filledAmount), order.tokenOut, order.typeOut)}
                                                        </span>
                                                    </>
                                                ) : (
                                                    formatAmount(order.amountOut, order.tokenOut, order.typeOut)
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                {getTokenSymbol(order.tokenOut, order.typeOut, Number(order.targetChainId) || chainId || undefined)}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                {/* to {Number(order.targetChainId) === 0 ? (CHAINS[chainId || 0]?.name || 'Unknown') : (CHAINS[Number(order.targetChainId)]?.name || 'Unknown')} */}
                                            </div>
                                            {/* Progress bar for partial fills */}
                                            {order.filledAmount > 0n && (
                                                <div style={{ marginTop: '0.5rem', width: '100%' }}>
                                                    <div style={{
                                                        background: 'rgba(255,255,255,0.1)',
                                                        borderRadius: '4px',
                                                        height: '4px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            background: '#22c55e',
                                                            width: `${Number((order.filledAmount * 100n) / order.amountOut)}%`,
                                                            height: '100%',
                                                            borderRadius: '4px'
                                                        }} />
                                                    </div>
                                                    <div style={{ fontSize: '0.6rem', color: '#22c55e', marginTop: '0.25rem' }}>
                                                        {Number((order.filledAmount * 100n) / order.amountOut)}% filled
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {activeTab === 'market' && !match && order.status === OrderStatus.ACTIVE && (
                                        <div style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            Waiting/Looking for match...
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
}
