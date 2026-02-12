import { useState, useEffect, useRef } from 'react';
import { useWeb3, useWeb3Sync } from '../store/useWeb3';
import { Wallet, LogOut, ChevronDown, Globe } from 'lucide-react';
import { CHAINS } from '../config/contracts';
import { useDisconnect, useWeb3ModalProvider } from '@web3modal/ethers/react';

export default function Header() {
    const { open } = useWeb3Sync();
    const { disconnect: disconnectModal } = useDisconnect();
    const { walletProvider } = useWeb3ModalProvider();
    const { address, balance, chainId, isConnecting, error } = useWeb3();
    const [isChainOpen, setIsChainOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentChainName = chainId ? CHAINS[chainId]?.name : 'Unknown Chain';

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent | TouchEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsChainOpen(false);
            }
        };
        if (isChainOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isChainOpen]);

    // Chain switching using walletProvider directly (works with WalletConnect)
    const handleSwitchChain = async (targetChainId: number) => {
        if (!walletProvider) {
            console.error('No wallet provider available');
            return;
        }
        try {
            await walletProvider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }]
            });
        } catch (err: any) {
            console.error('Switch chain error:', err);
            // If chain doesn't exist, try adding it
            if (err.code === 4902) {
                const chain = CHAINS[targetChainId];
                if (chain) {
                    try {
                        await walletProvider.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: `0x${targetChainId.toString(16)}`,
                                chainName: chain.name,
                                rpcUrls: [chain.rpc],
                                nativeCurrency: chain.nativeCurrency
                            }]
                        });
                    } catch (addErr) {
                        console.error('Add chain error:', addErr);
                    }
                }
            }
        }
        setIsChainOpen(false);
    };

    return (
        <header className="header-container">
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
                <span className="gradient-text">MVI</span> DApp
            </h1>

            <div className="header-right">
                {error && (
                    <span style={{ color: 'var(--error)', fontSize: '0.875rem' }}>{error}</span>
                )}

                {address ? (
                    <>
                        {/* Chain Dropdown */}
                        <div style={{ position: 'relative' }} ref={dropdownRef}>
                            <button
                                className="btn"
                                onClick={() => setIsChainOpen(!isChainOpen)}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.875rem',
                                    padding: '0.5rem 1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    minWidth: '160px',
                                    justifyContent: 'space-between'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Globe size={16} color="#60a5fa" />
                                    <span>{currentChainName || `Chain ID ${chainId}`}</span>
                                </div>
                                <ChevronDown size={16} style={{ transition: 'transform 0.2s', transform: isChainOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                            </button>

                            {isChainOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '0.5rem',
                                    background: '#1a1b1f',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '0.5rem',
                                    minWidth: '200px',
                                    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                                    zIndex: 50,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.25rem'
                                }}>
                                    <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Select Network
                                    </div>
                                    {Object.entries(CHAINS).map(([id, config]) => {
                                        const chainIdNum = Number(id);
                                        const isActive = chainId === chainIdNum;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => handleSwitchChain(chainIdNum)}
                                                onTouchEnd={(e) => {
                                                    e.preventDefault();
                                                    handleSwitchChain(chainIdNum);
                                                }}
                                                style={{
                                                    background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    padding: '0.75rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    cursor: 'pointer',
                                                    color: isActive ? '#818cf8' : 'var(--text-secondary)',
                                                    width: '100%',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => !isActive && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                onMouseLeave={(e) => !isActive && (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <div style={{
                                                    width: '8px',
                                                    height: '8px',
                                                    borderRadius: '50%',
                                                    background: isActive ? '#818cf8' : 'rgba(255,255,255,0.2)'
                                                }} />
                                                {(config as { name: string }).name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                {parseFloat(balance).toFixed(4)} ETH
                            </span>
                            <span style={{
                                fontSize: '0.875rem',
                                fontFamily: 'monospace',
                                padding: '0.25rem 0.5rem',
                                background: 'rgba(139, 92, 246, 0.1)',
                                borderRadius: '6px'
                            }}>
                                {address.slice(0, 6)}...{address.slice(-4)}
                            </span>
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={() => disconnectModal()}
                            style={{ padding: '0.75rem' }}
                        >
                            <LogOut size={18} />
                        </button>
                    </>
                ) : (
                    <button
                        className="btn btn-primary"
                        onClick={() => open()}
                        disabled={isConnecting}
                    >
                        <Wallet size={18} />
                        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                    </button>
                )}
            </div>
        </header>
    );
}
