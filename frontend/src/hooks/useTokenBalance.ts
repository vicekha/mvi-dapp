import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../store/useWeb3';
import { ABIS, AssetType } from '../config/contracts';

interface UseTokenBalanceResult {
    balance: bigint;
    formatted: string;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

// Global cache and pending requests to share data across all useTokenBalance instances
interface CacheEntry {
    value: bigint;
    decimals: number;
    timestamp: number;
}

const balanceCache: Record<string, CacheEntry> = {};
const pendingRequests: Record<string, Promise<{ value: bigint; decimals: number }> | undefined> = {};
const CACHE_TTL = 30000; // 30 seconds

export function useTokenBalance(
    tokenAddress?: string,
    assetType: AssetType = AssetType.ERC20
): UseTokenBalanceResult {
    const { address, provider, chainId } = useWeb3();
    const [balance, setBalance] = useState<bigint>(0n);
    const [formatted, setFormatted] = useState<string>('0');
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBalance = useCallback(async (isInitial = false) => {
        if (!address || !provider || !tokenAddress || !chainId) {
            setBalance(0n);
            setFormatted('0');
            return;
        }

        // Add a small jitter for initial bursts (e.g. modal opening)
        if (isInitial) {
            const jitter = Math.random() * 1500; // Increased jitter to 1.5s
            await new Promise(r => setTimeout(r, jitter));
        }

        const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}:${address.toLowerCase()}`;

        // 1. Check Cache
        const cached = balanceCache[cacheKey];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setBalance(cached.value);
            setFormatted(ethers.formatUnits(cached.value, cached.decimals));
            return;
        }

        // 2. Check for Pending Request (De-duplication)
        if (pendingRequests[cacheKey]) {
            setLoading(true);
            try {
                const result = await pendingRequests[cacheKey];
                setBalance(result.value);
                setFormatted(ethers.formatUnits(result.value, result.decimals));
            } catch (err) {
                setError((err as Error).message);
            } finally {
                setLoading(false);
            }
            return;
        }

        setLoading(true);
        setError(null);

        // Define the request promise with retry logic
        const requestPromise = (async () => {
            const executeFetch = async (retryCount = 0): Promise<{ value: bigint; decimals: number }> => {
                try {
                    let newVal = 0n;
                    let decimals = 18;

                    // 1. Native Token (Address Zero)
                    if (tokenAddress === ethers.ZeroAddress) {
                        newVal = await provider.getBalance(address);
                    }
                    // 2. ERC721 (NFT)
                    else if (assetType === AssetType.ERC721) {
                        const contract = new ethers.Contract(tokenAddress, ABIS.ERC721, provider);
                        newVal = await contract.balanceOf(address);
                        decimals = 0;
                    }
                    // 3. ERC20
                    else {
                        const contract = new ethers.Contract(tokenAddress, ABIS.ERC20, provider);
                        newVal = await contract.balanceOf(address);
                        try {
                            decimals = Number(await contract.decimals());
                        } catch {
                            decimals = 18; // Default fallback
                        }
                    }

                    return { value: newVal, decimals };
                } catch (err: any) {
                    // Retry on rate limit or generic error
                    if (retryCount < 2) {
                        const delay = (retryCount + 1) * 2000; // 2s, 4s delay
                        await new Promise(r => setTimeout(r, delay));
                        return executeFetch(retryCount + 1);
                    }
                    throw err;
                }
            };

            const result = await executeFetch();

            // Update Cache
            balanceCache[cacheKey] = {
                value: result.value,
                decimals: result.decimals,
                timestamp: Date.now()
            };

            return result;
        })();

        // Store in pending requests
        pendingRequests[cacheKey] = requestPromise;

        try {
            const result = await requestPromise;
            setBalance(result.value);
            setFormatted(ethers.formatUnits(result.value, result.decimals));
        } catch (err) {
            console.error('Error fetching balance:', err);
            const errMsg = (err as Error).message;
            if (errMsg.includes('too many errors') || errMsg.includes('429')) {
                setError('Network busy, retrying...');
            } else {
                setError(errMsg);
            }
            setBalance(0n);
            setFormatted('0');
        } finally {
            delete pendingRequests[cacheKey];
            setLoading(false);
        }
    }, [address, provider, tokenAddress, assetType, chainId]);

    // Fetch on mount or dependency change
    useEffect(() => {
        fetchBalance(true);
    }, [fetchBalance, chainId]);

    return { balance, formatted, loading, error, refetch: fetchBalance };
}
