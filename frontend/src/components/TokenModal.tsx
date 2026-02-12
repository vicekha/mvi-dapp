// Deferring replacement to clean up imports first if needed, but actually imports are fine.
import { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, X, Check } from 'lucide-react';
import { useTokenList } from '../hooks/useTokenList';
import { useWeb3 } from '../store/useWeb3';
import { useTokenBalance } from '../hooks/useTokenBalance';
import { CHAINS } from '../config/contracts';

interface TokenModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (token: any) => void;
    selectedTokenAddress?: string;
    customChainId?: number;
    showAllChains?: boolean;
}

// Separate component to handle individual token balance hooks
const TokenItem = ({ token, isSelected, onSelect, onClose, showChainBadge }: {
    token: any,
    isSelected: boolean,
    onSelect: (t: any) => void,
    onClose: () => void,
    showChainBadge?: boolean
}) => {
    const { formatted: balance, loading } = useTokenBalance(token.address, token.assetType);
    const chainName = CHAINS[token.chainId]?.name || `Chain ${token.chainId}`;

    return (
        <div
            onClick={() => {
                onSelect(token);
                onClose();
            }}
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 20px',
                cursor: 'pointer',
                opacity: isSelected ? 0.5 : 1,
                pointerEvents: isSelected ? 'none' : 'auto',
                transition: 'background 0.2s'
            }}
            className="token-item"
            onMouseEnter={(e) => e.currentTarget.style.background = '#2c2f36'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {token.logoURI ? (
                    <img
                        src={token.logoURI}
                        alt={token.symbol}
                        style={{ width: '36px', height: '36px', borderRadius: '50%' }}
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png' }}
                    />
                ) : (
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                        {token.symbol.slice(0, 2)}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 500, fontSize: '16px' }}>{token.symbol}</span>
                        {showChainBadge && (
                            <span style={{
                                fontSize: '10px',
                                background: '#333',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                color: '#ccc'
                            }}>
                                {chainName}
                            </span>
                        )}
                    </div>
                    <span style={{ fontSize: '12px', color: '#777' }}>{token.name}</span>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                {isSelected ? (
                    <Check size={18} color="#8b5cf6" />
                ) : (
                    <span style={{ fontSize: '14px', color: '#ccc' }}>
                        {loading ? '...' : parseFloat(balance).toFixed(4)}
                    </span>
                )}
            </div>
        </div>
    );
};

export default function TokenModal({ isOpen, onClose, onSelect, selectedTokenAddress, customChainId, showAllChains = false }: TokenModalProps) {
    const { chainId } = useWeb3();
    const activeChainId = customChainId || chainId || 0;
    const { tokens, loading, error } = useTokenList(activeChainId, showAllChains);
    const [searchQuery, setSearchQuery] = useState('');

    // Filter tokens based on search
    const filteredTokens = useMemo(() => {
        if (!searchQuery) return tokens;
        const lowerQuery = searchQuery.toLowerCase();
        return tokens.filter(t =>
            t.symbol.toLowerCase().includes(lowerQuery) ||
            t.name.toLowerCase().includes(lowerQuery) ||
            t.address.toLowerCase() === lowerQuery
        );
    }, [tokens, searchQuery]);

    return (
        <Dialog.Root open={isOpen} onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 50,
                    animation: 'fadeIn 0.2s ease-out'
                }} />
                <Dialog.Content className="dialog-content" style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: '#1a1b1f',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '20px',
                    width: '90%',
                    maxWidth: '420px',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 51,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    color: 'white'
                }}>
                    {/* Header */}
                    <div style={{ padding: '20px', paddingBottom: '0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <Dialog.Title style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Select a token</Dialog.Title>
                            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div style={{
                            background: '#131418',
                            border: '1px solid #2c2f36',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px',
                            gap: '10px'
                        }}>
                            <Search size={18} color="#777" />
                            <input
                                type="text"
                                placeholder="Search name or paste address"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '16px',
                                    width: '100%',
                                    outline: 'none'
                                }}
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Separator */}
                    <div style={{ height: '1px', background: '#2c2f36', marginTop: '20px', width: '100%' }}></div>

                    {/* Token List */}
                    <div style={{ overflowY: 'auto', padding: '10px 0', flex: 1 }}>
                        {loading && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#777' }}>Loading tokens...</div>
                        )}

                        {error && (
                            <div style={{ padding: '10px 20px', fontSize: '12px', color: '#ff6b6b' }}>{error}</div>
                        )}

                        {!loading && filteredTokens.length === 0 && (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#777' }}>No tokens found</div>
                        )}

                        {!loading && filteredTokens.map((token) => (
                            <TokenItem
                                key={token.address}
                                token={token}
                                isSelected={selectedTokenAddress?.toLowerCase() === token.address.toLowerCase()}
                                onSelect={onSelect}
                                onClose={onClose}
                                showChainBadge={showAllChains}
                            />
                        ))}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
