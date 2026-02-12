import { useState, useEffect } from 'react';
import { TOKENS, AssetType, CHAINS } from '../config/contracts';


interface TokenInfo {
    chainId: number;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
    assetType?: AssetType;
    minutesRatio?: number;
}



// Helper function to get the appropriate logo for native currencies
function getNativeCurrencyLogo(symbol: string): string {
    const logoMap: Record<string, string> = {
        'ETH': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
        'LREACT': 'https://cryptologos.cc/logos/ethereum-eth-logo.png', // Placeholder for LREACT
        'POL': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
    };
    return logoMap[symbol] || 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
}

export function useTokenList(chainId: number, fetchAllChains: boolean = false) {
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const loading = false;
    const error = null;

    useEffect(() => {
        // Helper to formatting tokens
        const formatTokens = (list: any[], cId: number) => {
            const nativeCurrency = CHAINS[cId]?.nativeCurrency;
            return list.map(t => {
                const isNativeToken = t.address === '0x0000000000000000000000000000000000000000';
                const symbol = isNativeToken && nativeCurrency ? nativeCurrency.symbol : t.symbol;
                const logoURI = isNativeToken && nativeCurrency
                    ? getNativeCurrencyLogo(nativeCurrency.symbol)
                    : t.logoURI || 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png';

                return {
                    chainId: cId,
                    address: t.address,
                    name: symbol,
                    symbol: symbol,
                    decimals: t.decimals,
                    assetType: t.assetType,
                    minutesRatio: t.minutesRatio,
                    logoURI
                };
            });
        };

        if (fetchAllChains) {
            // Aggregate all tokens from local config
            const allTokens: TokenInfo[] = [];
            Object.entries(TOKENS).forEach(([cIdStr, list]) => {
                const cId = Number(cIdStr);
                allTokens.push(...formatTokens(list, cId));
            });
            setTokens(allTokens);
            return;
        }

        // Standard Single Chain Logic
        const localTokenConfig = TOKENS[chainId] || [];
        const localTokens = formatTokens(localTokenConfig, chainId);
        setTokens(localTokens);

    }, [chainId, fetchAllChains]);

    return { tokens, loading, error };
}



