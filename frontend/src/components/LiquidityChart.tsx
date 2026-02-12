import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ethers } from 'ethers';
import { TOKENS, AssetType, CHAINS } from '../config/contracts';

// Re-using interfaces/types from parent (or redefining if necessary)
// Ideally these should be in a shared types file, but for now we'll match OrdersPanel
enum OrderStatus {
    ACTIVE = 0,
    FILLED = 1,
    PARTIALLY_FILLED = 2,
    CANCELLED = 3,
    EXPIRED = 4
}

interface Order {
    id: string;
    maker: string;
    tokenIn: string;
    tokenOut: string;
    typeIn: number;
    typeOut: number;
    amountIn: bigint;
    amountOut: bigint;
    filledAmount: bigint;
    expiration: bigint;
    status: OrderStatus;
    targetChainId: bigint;
}

interface LiquidityChartProps {
    orders: Order[];
    chainId: number;
}

export default function LiquidityChart({ orders, chainId }: LiquidityChartProps) {
    const [selectedPair, setSelectedPair] = useState<string>('');



    // Helper to get symbol
    const getSymbol = (tokenAddress: string, assetType: number, tokenChainId?: number) => {
        const effectiveChainId = tokenChainId || chainId;
        if (tokenAddress === ethers.ZeroAddress) {
            return CHAINS[effectiveChainId || 0]?.nativeCurrency?.symbol || 'ETH';
        }
        const tokensForChain = effectiveChainId ? TOKENS[effectiveChainId] || [] : [];
        const t = tokensForChain.find(x => x.address.toLowerCase() === tokenAddress.toLowerCase());
        return t?.symbol || (assetType === AssetType.ERC721 ? 'NFT' : 'TOKEN');
    };

    const getDecimals = (tokenAddress: string, tokenChainId?: number) => {
        const effectiveChainId = tokenChainId || chainId;
        const tokensForChain = effectiveChainId ? TOKENS[effectiveChainId] || [] : [];
        const t = tokensForChain.find(x => x.address.toLowerCase() === tokenAddress.toLowerCase());
        return t?.decimals ?? 18;
    };

    // 1. Group orders by pair to populate dropdown
    const pairs = useMemo(() => {
        const pMap = new Map<string, { tokenA: string; tokenB: string; symbolA: string; symbolB: string, count: number }>();

        orders.forEach(o => {
            const symIn = getSymbol(o.tokenIn, o.typeIn);
            const symOut = getSymbol(o.tokenOut, o.typeOut, Number(o.targetChainId) || chainId);

            // Normalize pair key (alphabetical) to group A->B and B->A
            const [base, quote] = [symIn, symOut].sort();
            const key = `${base}/${quote}`;

            if (!pMap.has(key)) {
                pMap.set(key, {
                    tokenA: o.tokenIn, // Note: This is loose, just for ID
                    tokenB: o.tokenOut,
                    symbolA: base,
                    symbolB: quote,
                    count: 0
                });
            }
            pMap.get(key)!.count++;
        });

        // Set default selection to most active pair
        const sorted = Array.from(pMap.values()).sort((a, b) => b.count - a.count);
        if (sorted.length > 0 && !selectedPair) {
            setSelectedPair(`${sorted[0].symbolA}/${sorted[0].symbolB}`);
        }

        return sorted;
    }, [orders, chainId, selectedPair]);

    // 2. Process data for selected pair
    const chartData = useMemo(() => {
        if (!selectedPair) return [];

        const [baseSym, quoteSym] = selectedPair.split('/');

        // We want to visualize "Market Depth" for this pair.
        // "Bids": People BUYING Base (Have Quote, Want Base)
        // "Asks": People SELLING Base (Have Base, Want Quote)

        const bids: { price: number; volume: number }[] = [];
        const asks: { price: number; volume: number }[] = [];

        orders.forEach(o => {
            const symIn = getSymbol(o.tokenIn, o.typeIn);
            const symOut = getSymbol(o.tokenOut, o.typeOut, Number(o.targetChainId) || chainId);

            // Filter for this pair
            if (!([symIn, symOut].includes(baseSym) && [symIn, symOut].includes(quoteSym))) return;

            // Decimals
            const decIn = getDecimals(o.tokenIn);
            const decOut = getDecimals(o.tokenOut, Number(o.targetChainId) || chainId);

            const amtIn = parseFloat(ethers.formatUnits(o.amountIn, decIn));
            const amtOut = parseFloat(ethers.formatUnits(o.amountOut, decOut));

            // Avoid division by zero
            if (amtIn === 0 || amtOut === 0) return;

            // Logic:
            // If I Have Base (symIn === baseSym), I am SELLING Base. My Price = AmtOut(Quote) / AmtIn(Base). -> ASK
            // If I Have Quote (symIn === quoteSym), I am BUYING Base. My Price = AmtIn(Quote) / AmtOut(Base).
            // Wait: "Have Quote, Want Base". Cost = AmtIn(Quote). Received = AmtOut(Base). Price = AmtIn / AmtOut. -> BID

            if (symIn === baseSym) {
                // ASK (Selling Base)
                // Price = Quote / Base
                const price = amtOut / amtIn;
                asks.push({ price, volume: amtIn }); // Volume in Base
            } else {
                // BID (Buying Base)
                // Price = Quote / Base
                const price = amtIn / amtOut; // (How much Quote I pay per Base I get)
                bids.push({ price, volume: amtOut }); // Volume in Base (what I want)
            }
        });

        // Sort
        bids.sort((a, b) => b.price - a.price); // Descending price for bids
        asks.sort((a, b) => a.price - b.price); // Ascending price for asks

        // Calculate Cumulative
        const data: { price: number; bidDepth?: number; askDepth?: number }[] = [];

        let cumBid = 0;
        bids.forEach(b => {
            cumBid += b.volume;
            data.push({ price: b.price, bidDepth: cumBid });
        });

        let cumAsk = 0;
        asks.forEach(a => {
            cumAsk += a.volume;
            data.push({ price: a.price, askDepth: cumAsk });
        });

        return data.sort((a, b) => a.price - b.price);
    }, [orders, selectedPair, chainId]);

    if (pairs.length === 0) return null;

    return (
        <div style={{ marginTop: '1rem' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <select
                    className="input"
                    value={selectedPair}
                    onChange={e => setSelectedPair(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.3)' }}
                >
                    {pairs.map(p => (
                        <option key={`${p.symbolA}/${p.symbolB}`} value={`${p.symbolA}/${p.symbolB}`}>
                            {p.symbolA}/{p.symbolB} ({p.count} orders)
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorAsk" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="price"
                            type="number"
                            domain={['auto', 'auto']}
                            tickFormatter={(val) => val.toFixed(4)}
                            stroke="#888"
                        />
                        <YAxis stroke="#888" />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1a1b1e', border: '1px solid #333' }}
                            formatter={(value: any) => value ? Number(value).toFixed(4) : '0'}
                            labelFormatter={(label: any) => `Price: ${Number(label).toFixed(6)}`}
                        />
                        <Area
                            type="stepAfter"
                            dataKey="bidDepth"
                            stroke="#22c55e"
                            fillOpacity={1}
                            fill="url(#colorBid)"
                            name="Buy Depth"
                            connectNulls
                        />
                        <Area
                            type="stepAfter"
                            dataKey="askDepth"
                            stroke="#ef4444"
                            fillOpacity={1}
                            fill="url(#colorAsk)"
                            name="Sell Depth"
                            connectNulls
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
