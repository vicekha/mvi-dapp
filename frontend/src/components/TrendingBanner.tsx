import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../store/useWeb3';
import { CONTRACTS, ABIS, TOKENS, AssetType, CHAINS } from '../config/contracts';
import { Flame } from 'lucide-react';

export default function TrendingBanner() {
    const { provider, chainId } = useWeb3();
    const [trendingTokens, setTrendingTokens] = useState<{ symbol: string; count: number }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTrends = async () => {
            if (!provider || !chainId || !CONTRACTS[chainId]) {
                setLoading(false);
                return;
            }

            try {
                const orderProcessor = new ethers.Contract(
                    CONTRACTS[chainId].ORDER_PROCESSOR,
                    ABIS.ORDER_PROCESSOR,
                    provider
                );

                // Fetch recent events (last 1000 blocks to ensure relevance)
                const currentBlock = await provider.getBlockNumber();
                const startBlock = Math.max(CHAINS[chainId]?.startBlock || 0, currentBlock - 1000);

                const filter = orderProcessor.filters.OrderCreated();
                const events = await orderProcessor.queryFilter(filter, startBlock, 'latest');

                const demandMap: Record<string, number> = {};

                // Process events
                for (const event of events) {
                    if ('args' in event) {
                        // args[3] is tokenOut (what maker WANTS => Demand)
                        const tokenOut = event.args[3];
                        // args[5] is typeOut
                        const typeOut = Number(event.args[5]);

                        let symbol = "Unknown";
                        if (tokenOut === ethers.ZeroAddress) {
                            symbol = CHAINS[chainId]?.nativeCurrency?.symbol || 'ETH';
                        } else {
                            // Find in local config first for speed
                            const tokenConfig = TOKENS[chainId]?.find(t => t.address.toLowerCase() === tokenOut.toLowerCase());
                            if (tokenConfig) {
                                symbol = tokenConfig.symbol;
                            } else {
                                symbol = (typeOut === AssetType.ERC721) ? 'NFT Collection' : `${tokenOut.slice(0, 6)}...`;
                            }
                        }

                        demandMap[symbol] = (demandMap[symbol] || 0) + 1;
                    }
                }

                // Convert to array and sort
                const sorted = Object.entries(demandMap)
                    .map(([symbol, count]) => ({ symbol, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10); // Top 10

                setTrendingTokens(sorted);
            } catch (err) {
                console.error("Error fetching trending tokens:", err);
            }
            setLoading(false);
        };

        fetchTrends();

        // Real-time listener
        if (chainId && CONTRACTS[chainId]) {
            const orderProcessor = new ethers.Contract(
                CONTRACTS[chainId].ORDER_PROCESSOR,
                ABIS.ORDER_PROCESSOR,
                provider
            );
            // Refresh logic
            const refresh = () => { fetchTrends(); };

            orderProcessor.on("OrderCreated", refresh);

            // Poll fallback
            const interval = setInterval(fetchTrends, 60000);

            return () => {
                clearInterval(interval);
                orderProcessor.off("OrderCreated", refresh);
            };
        }
    }, [provider, chainId]);

    // Always render, even if empty (show placeholder)
    const showPlaceholder = loading || trendingTokens.length === 0;

    return (
        <div className="trending-banner">
            <div className="trending-label">
                <Flame size={16} color="#ef4444" />
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ff8a00' }}>TRENDING</span>
            </div>

            <div className="trending-marquee">
                {showPlaceholder ? (
                    <div style={{ color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>
                        Market activity is quiet... be the first to swap!
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '2rem', animation: 'scrollLeft 30s linear infinite' }}>
                        {/* Duplicate list for seamless loop */}
                        {[...trendingTokens, ...trendingTokens, ...trendingTokens].map((token, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{token.symbol}</span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {token.count} orders
                                </span>
                                {i < (trendingTokens.length * 3) - 1 && <span style={{ color: '#475569' }}>•</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                @keyframes scrollLeft {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-33.33%); }
                }
            `}</style>
        </div>
    );
}
