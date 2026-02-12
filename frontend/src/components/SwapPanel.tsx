import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../store/useWeb3';
import { TOKENS, CHAINS, AssetType, ABIS, CONTRACTS } from '../config/contracts';
import { ArrowDownUp, Loader2, AlertCircle, CheckCircle, ChevronDown, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import TokenModal from './TokenModal';
import { useTokenBalance } from '../hooks/useTokenBalance';

export default function SwapPanel() {
    const { address, chainId, getContract, signer, provider } = useWeb3();
    const [tokenIn, setTokenIn] = useState<any>(null);
    const [tokenOut, setTokenOut] = useState<any>(null);
    const [amountIn, setAmountIn] = useState('');
    const [amountOut, setAmountOut] = useState('');

    // Target Chain State for Cross-Chain Swaps
    const [targetChainId, setTargetChainId] = useState<number>(0);
    const [swapMode, setSwapMode] = useState<'p2p' | 'bridge'>('p2p');

    const [duration, setDuration] = useState<bigint>(86400n); // Default 24 hours
    const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });

    // Modal State
    const [isTokenInModalOpen, setIsTokenInModalOpen] = useState(false);
    const [isTokenOutModalOpen, setIsTokenOutModalOpen] = useState(false);

    // NFT ownership state - stores owned token IDs for NFT collections
    const [ownedNFTs, setOwnedNFTs] = useState<string[]>([]);
    const [loadingNFTs, setLoadingNFTs] = useState(false);

    // Fetch owned NFTs when tokenIn is an NFT collection
    useEffect(() => {
        const fetchOwnedNFTs = async () => {
            if (!tokenIn || tokenIn.assetType !== AssetType.ERC721 || !address || !provider) {
                setOwnedNFTs([]);
                return;
            }

            setLoadingNFTs(true);
            try {
                const nftContract = new ethers.Contract(
                    tokenIn.address,
                    [
                        'function balanceOf(address) view returns (uint256)',
                        'function tokenOfOwnerByIndex(address, uint256) view returns (uint256)'
                    ],
                    provider
                );

                const balance = await nftContract.balanceOf(address);
                const tokenIds: string[] = [];

                for (let i = 0; i < Number(balance); i++) {
                    const tokenId = await nftContract.tokenOfOwnerByIndex(address, i);
                    tokenIds.push(tokenId.toString());
                }

                setOwnedNFTs(tokenIds);
                // Auto-select first NFT if none selected
                if (tokenIds.length > 0 && !amountIn) {
                    setAmountIn(tokenIds[0]);
                }
            } catch (err) {
                console.error('Error fetching owned NFTs:', err);
                setOwnedNFTs([]);
            }
            setLoadingNFTs(false);
        };

        fetchOwnedNFTs();
    }, [tokenIn, address, provider]);

    // Initial Load - Set default tokens from local config if available
    useEffect(() => {
        if (chainId && TOKENS[chainId]) {
            // Only set defaults if not already set, or if chain changed and current tokens are invalid
            if (!tokenIn) setTokenIn(TOKENS[chainId][0]);

            // Sync target chain ID if it wasn't set or is outdated
            if (!targetChainId || targetChainId === 0) {
                setTargetChainId(chainId);
                if (!tokenOut) setTokenOut(TOKENS[chainId][1] || TOKENS[chainId][0]);
            }
        }
    }, [chainId]);

    // Ensure targetChainId defaults to current chain on first load
    useEffect(() => {
        if (chainId && (!targetChainId || targetChainId === 0)) {
            setTargetChainId(chainId);
        }
    }, [chainId, targetChainId]);

    const chainName = chainId ? CHAINS[chainId]?.name : 'Unknown';
    const isSupported = chainId ? !!CONTRACTS[chainId] : false;

    // Fetch Balances
    const { formatted: balanceIn, loading: loadingBalanceIn } = useTokenBalance(tokenIn?.address, tokenIn?.assetType);

    const hasBridgeSupport = chainId ? !!CONTRACTS[chainId]?.BRIDGE_SWAP_MAIN : false;

    // Switch back to p2p if current chain doesn't support bridge
    useEffect(() => {
        if (swapMode === 'bridge' && chainId && !CONTRACTS[chainId]?.BRIDGE_SWAP_MAIN) {
            setSwapMode('p2p');
        }
    }, [chainId, swapMode]);

    // Determine input labels based on asset types
    const getInputLabel = (token: typeof tokenIn, isInput: boolean) => {
        if (!token) return isInput ? 'Amount' : 'Amount';
        if (token.assetType === AssetType.ERC721) {
            return isInput ? 'Token ID' : 'Token ID';
        }
        return isInput ? 'Amount' : 'Price you want';
    };

    const handleSwap = async () => {
        if (!tokenIn || !tokenOut || !amountIn || !amountOut || !address || !signer) {
            toast.error('Please fill all fields');
            return;
        }

        if (!isSupported) {
            toast.error('Please switch to a supported chain');
            return;
        }

        setStatus({ type: 'loading', message: 'Calculating fee...' });

        try {
            const feeDistributor = getContract('FEE_DISTRIBUTOR');
            const walletSwapMain = getContract('WALLET_SWAP_MAIN');
            const bridgeSwapMain = getContract('BRIDGE_SWAP_MAIN');

            if (swapMode === 'p2p' && (!feeDistributor || !walletSwapMain)) {
                throw new Error(`P2P Contracts not found for chain ${chainId}`);
            }

            if (swapMode === 'bridge' && !bridgeSwapMain) {
                throw new Error(`Bridge Contract not found for chain ${chainId}`);
            }

            console.log('=== SWAP DEBUG ===');
            console.log('Chain ID:', chainId);
            console.log('Target Chain ID:', targetChainId);

            console.log('Token In:', tokenIn.symbol, 'Amount:', amountIn);
            console.log('Token Out:', tokenOut.symbol, 'Amount:', amountOut);

            // Parse input amount
            // Reverting to using token ID as amount for NFT based on user feedback/contract requirement
            const amountInWei = tokenIn.assetType === AssetType.ERC721
                ? BigInt(Math.floor(parseFloat(amountIn)))  // NFT: token ID
                : ethers.parseUnits(amountIn, tokenIn.decimals);

            // Parse output amount
            const amountOutWei = tokenOut.assetType === AssetType.ERC721
                ? BigInt(Math.floor(parseFloat(amountOut)))  // NFT: token ID
                : ethers.parseUnits(amountOut, tokenOut.decimals);

            // Calculate minutes valuation
            // Default to 1:1 if minutesRatio is undefined (external tokens)
            const ratioIn = tokenIn.minutesRatio || 1;
            const ratioOut = tokenOut.minutesRatio || 1;

            const minutesValueIn = tokenIn.assetType === AssetType.ERC721
                ? ethers.parseUnits((ratioIn).toString(), 18)  // NFT has fixed minutes value
                : ethers.parseUnits((parseFloat(amountIn) * ratioIn).toString(), 18);

            const minutesValueOut = tokenOut.assetType === AssetType.ERC721
                ? ethers.parseUnits((ratioOut).toString(), 18)
                : ethers.parseUnits((parseFloat(amountOut) * ratioOut).toString(), 18);

            console.log('Amount In Wei:', amountInWei.toString());
            console.log('Amount Out Wei:', amountOutWei.toString());
            console.log('Minutes In:', minutesValueIn.toString());
            console.log('Minutes Out:', minutesValueOut.toString());

            // 1. Calculate Fee (P2P ONLY)
            let fee = 0n;
            if (swapMode === 'p2p' && feeDistributor) {
                console.log('FeeDistributor Address:', await feeDistributor.getAddress());
                fee = await feeDistributor.calculateFee(
                    ethers.getAddress(tokenIn.address),
                    tokenIn.assetType || AssetType.ERC20,
                    amountInWei,
                    minutesValueIn
                );
                console.log('=== FEE DEBUG ===');
                console.log('Fee (wei):', fee.toString());
                console.log('Fee (ETH):', ethers.formatEther(fee));
            }

            // 2. Handle Approvals
            if (tokenIn.address !== ethers.ZeroAddress) {
                const spenderAddr = swapMode === 'p2p'
                    ? await walletSwapMain!.getAddress()
                    : await bridgeSwapMain!.getAddress();

                setStatus({ type: 'loading', message: `Checking approvals for ${tokenIn.symbol}...` });

                if (tokenIn.assetType === AssetType.ERC721) {
                    if (swapMode === 'bridge') {
                        throw new Error("Instant Bridge only supports ERC20 tokens at this time.");
                    }
                    const nftProper = new ethers.Contract(tokenIn.address, ABIS.ERC721, signer);
                    const isApproved = await nftProper.isApprovedForAll(address, spenderAddr);

                    if (!isApproved) {
                        setStatus({ type: 'loading', message: `Approving NFT for Swap Contract...` });
                        const tx = await nftProper.setApprovalForAll(spenderAddr, true);
                        await tx.wait();
                    }
                } else {
                    // ERC20 Token Logic
                    const erc20 = new ethers.Contract(tokenIn.address, ABIS.ERC20, signer);

                    // P2P needs (Amount + Fee) because it takes fee in-token
                    // Bridge currently just takes Amount (Fee logic not fully implemented in Bridge yet, or 1:1)
                    const totalAmountRequired = swapMode === 'p2p' ? amountInWei + fee : amountInWei;

                    setStatus({ type: 'loading', message: `Checking approval for ${tokenIn.symbol}...` });
                    const allowance = await erc20.allowance(address, spenderAddr);

                    if (allowance < totalAmountRequired) {
                        setStatus({ type: 'loading', message: `Approving ${tokenIn.symbol} (Max)...` });
                        if (allowance > 0n) {
                            try {
                                const resetTx = await erc20.approve(spenderAddr, 0);
                                await resetTx.wait();
                            } catch (e) {
                                console.warn("Approval reset failed", e);
                            }
                        }
                        const tx = await erc20.approve(spenderAddr, ethers.MaxUint256);
                        await tx.wait();
                    }
                }
            }

            // 3. Execute Transaction
            setStatus({ type: 'loading', message: swapMode === 'p2p' ? 'Creating swap order...' : 'Initiating bridge swap...' });

            const isNativeToken = tokenIn.address === ethers.ZeroAddress;
            const isNFT = tokenIn.assetType === AssetType.ERC721;
            const GAS_FEE = ethers.parseEther("0.002");

            let tx;
            if (swapMode === 'p2p') {
                const valueToSend = isNativeToken
                    ? amountInWei + fee + GAS_FEE
                    : (isNFT ? fee + GAS_FEE : GAS_FEE);

                tx = await walletSwapMain!.createOrder(
                    tokenIn.address,
                    tokenOut.address,
                    tokenIn.assetType || AssetType.ERC20,
                    tokenOut.assetType || AssetType.ERC20,
                    amountInWei,
                    amountOutWei,
                    minutesValueIn,
                    minutesValueOut,
                    0,
                    duration,
                    false,
                    targetChainId,
                    { value: valueToSend }
                );
            } else {
                // Bridge Logic
                const valueToSend = isNativeToken ? amountInWei : 0n;
                // Currently bridge uses exact 1:1 or logic in RSC, no frontend fee added here yet
                tx = await bridgeSwapMain!.initiateSwap(
                    tokenIn.address,
                    amountInWei,
                    tokenOut.address,
                    targetChainId,
                    { value: valueToSend }
                );
            }

            console.log('Transaction sent:', tx.hash);
            setStatus({ type: 'loading', message: 'Confirming transaction...' });
            const receipt = await tx.wait();

            // 4. Verify Asset (For NFTs - P2P ONLY)
            if (swapMode === 'p2p' && tokenIn.assetType === AssetType.ERC721) {
                setStatus({ type: 'loading', message: 'Verifying NFT ownership...' });
                try {
                    // Find OrderInitiated event manually since we don't rely on typed events
                    const iface = new ethers.Interface([
                        "event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)"
                    ]);

                    let orderId = null;
                    for (const log of receipt.logs) {
                        try {
                            const parsed = iface.parseLog(log);
                            if (parsed && parsed.name === 'OrderInitiated') {
                                orderId = parsed.args.orderId;
                                break;
                            }
                        } catch (e) { } // ignore non-matching logs
                    }

                    if (orderId) {
                        console.log('Verifying asset for Order:', orderId);
                        const assetVerifier = getContract('ASSET_VERIFIER');

                        if (assetVerifier) {
                            // Pass the actual token ID from the input (which we stored in amountIn string)
                            // Verify ownership of the specific Token ID
                            const tokenId = BigInt(amountIn); // amountIn holds the token ID string from dropdown

                            const verifyTx = await assetVerifier.verifyAsset(
                                orderId,
                                tokenIn.address,
                                tokenId,
                                receipt.hash
                            );
                            await verifyTx.wait();
                            console.log('NFT Verified!');
                            toast.success('NFT ownership verified!');
                        } else {
                            console.error('AssetVerifier contract not found');
                            // toast.error('AssetVerifier contract not found. Verification failed.');
                        }
                    } else {
                        console.warn('Could not find OrderInitiated event to verify NFT');
                        // toast.warning('Order created but could not verify NFT ownership automatically.');
                    }
                } catch (verifyErr) {
                    console.error('Asset verification failed:', verifyErr);
                    // toast.error('Swap created but NFT verification failed. Please check console.');
                }
            }
            setStatus({ type: 'success', message: 'Swap Initiated Successfully!' });
            toast.success('Swap order created!');

            // Clear input fields after success
            setAmountIn('');
            setAmountOut('');
            // Optional: trigger a balance refresh if possible, but for now just let the user continue


        } catch (error: any) {
            console.error('Swap failed:', error);
            setStatus({ type: 'error', message: error.message || 'Swap failed' });
            toast.error(error.reason || error.message || 'Transaction failed');
        }
    };





    return (
        <div className="card" style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Swap</h2>
                <div style={{ display: 'flex', background: '#131418', borderRadius: '12px', padding: '4px', border: '1px solid #2c2f36' }}>
                    <button
                        onClick={() => setSwapMode('p2p')}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: swapMode === 'p2p' ? '#2c2f36' : 'transparent',
                            color: swapMode === 'p2p' ? 'white' : '#999',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        P2P Match
                    </button>
                    {hasBridgeSupport && (
                        <button
                            onClick={() => setSwapMode('bridge')}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: swapMode === 'bridge' ? '#2c2f36' : 'transparent',
                                color: swapMode === 'bridge' ? 'white' : '#999',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Instant Bridge
                        </button>
                    )}
                </div>
            </div>
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <span className={`status-badge ${isSupported ? 'info' : 'error'}`}>
                    {chainName} ({chainId})
                </span>
            </div>

            {/* Token In */}
            <div style={{ marginBottom: '1rem', background: '#131418', padding: '16px', borderRadius: '16px', border: '1px solid #2c2f36' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label className="label">You Pay ({getInputLabel(tokenIn, true)})</label>
                    {tokenIn && (
                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#999', cursor: 'pointer' }}
                            onClick={() => {
                                if (tokenIn.assetType !== AssetType.ERC721) {
                                    setAmountIn(balanceIn);
                                }
                            }}
                        >
                            <Wallet size={12} />
                            <span>Balance: {loadingBalanceIn ? '...' : parseFloat(balanceIn).toFixed(4)}</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        {/* Show dropdown for NFTs, regular input for ERC20 */}
                        {tokenIn?.assetType === AssetType.ERC721 ? (
                            <select
                                value={amountIn}
                                onChange={(e) => setAmountIn(e.target.value)}
                                style={{
                                    width: '100%',
                                    fontSize: '28px',
                                    background: '#1a1b1f',
                                    border: '1px solid #2c2f36',
                                    borderRadius: '12px',
                                    color: 'white',
                                    outline: 'none',
                                    padding: '12px',
                                    cursor: 'pointer',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%2224%22 height%3D%2224%22 viewBox%3D%220 0 24 24%22 fill%3D%22none%22 stroke%3D%22%238b5cf6%22 stroke-width%3D%222%22%3E%3Cpolyline points%3D%226 9 12 15 18 9%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")',
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 12px center',
                                    backgroundSize: '24px'
                                }}
                            >
                                {loadingNFTs ? (
                                    <option value="">Loading NFTs...</option>
                                ) : ownedNFTs.length === 0 ? (
                                    <option value="">No NFTs owned</option>
                                ) : (
                                    ownedNFTs.map((tokenId) => (
                                        <option key={tokenId} value={tokenId}>
                                            {tokenIn?.symbol} #{tokenId}
                                        </option>
                                    ))
                                )}
                            </select>
                        ) : (
                            <input
                                className="input-transparent"
                                style={{
                                    width: '100%',
                                    fontSize: '36px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    outline: 'none',
                                    padding: 0,
                                    WebkitAppearance: 'textfield',
                                    MozAppearance: 'textfield'
                                } as React.CSSProperties}
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={amountIn}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    // Only allow positive numbers
                                    if (value === '' || parseFloat(value) >= 0) {
                                        setAmountIn(value);
                                    }
                                }}
                            />
                        )}
                    </div>
                    <button
                        onClick={() => setIsTokenInModalOpen(true)}
                        style={{
                            background: '#2c2f36',
                            border: 'none',
                            borderRadius: '16px',
                            padding: '6px 12px 6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '20px',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#40444f'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#2c2f36'}
                    >
                        {tokenIn ? (
                            <>
                                {tokenIn.logoURI && <img src={tokenIn.logoURI} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />}
                                {tokenIn.symbol}
                            </>
                        ) : (
                            "Select Token"
                        )}
                        <ChevronDown size={20} />
                    </button>
                </div>
            </div>

            {/* Swap Arrow with Cross-Chain Indicator if needed */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '-10px 0', position: 'relative', zIndex: 10 }}>
                {/* Visual Indicator for Cross Chain */}
                {chainId !== targetChainId && targetChainId !== 0 && (
                    <div style={{
                        background: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        color: 'white',
                        marginBottom: '4px',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}>
                        CROSS-CHAIN SWAP
                    </div>
                )}
                <div style={{
                    background: '#1a1b1f',
                    padding: '4px',
                    borderRadius: '12px',
                    border: '4px solid #0d0e12'
                }}>
                    <div
                        onClick={() => {
                            // Can only swap if same chain, otherwise just do nothing or warn
                            if (chainId !== targetChainId) {
                                toast.error("Cannot swap direction for cross-chain orders yet. Please switch wallet network.");
                                return;
                            }
                            if (!tokenIn && !tokenOut) return;
                            const tempToken = tokenIn;
                            const tempAmount = amountIn;
                            setTokenIn(tokenOut);
                            setAmountIn(amountOut);
                            setTokenOut(tempToken);
                            setAmountOut(tempAmount);
                        }}
                        style={{
                            background: 'rgba(139, 92, 246, 0.1)',
                            padding: '8px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'rotate(180deg)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'rotate(0deg)'}
                    >
                        <ArrowDownUp size={20} color="#8b5cf6" />
                    </div>
                </div>
            </div>

            {/* Token Out */}
            <div style={{ marginBottom: '1.5rem', background: '#131418', padding: '16px', borderRadius: '16px', border: '1px solid #2c2f36' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label className="label">You Receive ({getInputLabel(tokenOut, false)})</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Target Chain Selector */}
                        <div style={{ position: 'relative' }}>
                            <select
                                value={targetChainId}
                                onChange={(e) => {
                                    const newChainId = Number(e.target.value);
                                    setTargetChainId(newChainId);
                                    // Optional: Reset tokenOut if chain changes to avoid confusion
                                    // if (TOKENS[newChainId]) setTokenOut(TOKENS[newChainId][0]);
                                }}
                                style={{
                                    background: '#2c2f36',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    cursor: 'pointer',
                                    outline: 'none'
                                }}
                            >
                                {Object.keys(CHAINS).map((cId) => (
                                    <option key={cId} value={cId}>
                                        On {CHAINS[Number(cId)].name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <input
                            className="input-transparent"
                            style={{
                                width: '100%',
                                fontSize: '36px',
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                outline: 'none',
                                padding: 0,
                                WebkitAppearance: 'textfield',
                                MozAppearance: 'textfield'
                            } as React.CSSProperties}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={amountOut}
                            onChange={(e) => {
                                const value = e.target.value;
                                // Only allow positive numbers
                                if (value === '' || parseFloat(value) >= 0) {
                                    setAmountOut(value);
                                }
                            }}
                        />
                    </div>
                    <button
                        onClick={() => setIsTokenOutModalOpen(true)}
                        style={{
                            background: '#2c2f36',
                            border: 'none',
                            borderRadius: '16px',
                            padding: '6px 12px 6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '20px',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#40444f'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#2c2f36'}
                    >
                        {tokenOut ? (
                            <>
                                {tokenOut.logoURI && <img src={tokenOut.logoURI} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />}
                                {tokenOut.symbol}
                            </>
                        ) : (
                            "Select Token"
                        )}
                        <ChevronDown size={20} />
                    </button>
                </div>
                {tokenIn?.assetType === AssetType.ERC721 && tokenOut?.assetType !== AssetType.ERC721 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        💡 Enter how much {tokenOut?.symbol} you want for your NFT
                    </p>
                )}
            </div>

            {/* Note for Cross Chain */}
            {chainId !== targetChainId && targetChainId !== 0 && (
                <div style={{ marginBottom: '1.5rem', background: 'rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: '12px', color: '#ccc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontWeight: 'bold', color: 'white' }}>
                        <AlertCircle size={14} color="#8b5cf6" />
                        <span>Atomic Ownership Swap</span>
                    </div>
                    You are placing an order on <b>{chainName}</b> to receive tokens on <b>{CHAINS[targetChainId]?.name}</b>.
                    This order will be matched P2P by the Reactive Network.
                </div>
            )}




            {/* Duration Selector */}
            <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">Order Duration</label>
                <select
                    className="select"
                    style={{ width: '100%' }}
                    value={duration.toString()}
                    onChange={(e) => setDuration(BigInt(e.target.value))}
                >
                    <option value="3600">1 Hour</option>
                    <option value="86400">24 Hours (Default)</option>
                    <option value="259200">3 Days</option>
                    <option value="604800">7 Days</option>
                </select>
            </div>

            {/* Status */}
            {status.type !== 'idle' && (
                <div
                    className={`status-badge ${status.type}`}
                    style={{ width: '100%', marginBottom: '1rem' }}
                >
                    {status.type === 'loading' && <Loader2 size={16} className="animate-spin" />}
                    {status.type === 'success' && <CheckCircle size={16} />}
                    {status.type === 'error' && <AlertCircle size={16} />}
                    <span>{status.message}</span>
                </div>
            )}



            {/* Submit */}
            <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '1rem' }}
                disabled={!address || !amountIn || !amountOut || status.type === 'loading' || !isSupported}
                onClick={handleSwap}
            >
                {status.type === 'loading' ? 'Processing...' : (swapMode === 'p2p' ? 'Create Swap Order' : 'Instant Bridge Swap')}
            </button>

            {/* Liquidity Section (Bridge Only) */}
            {swapMode === 'bridge' && (
                <div style={{ background: '#131418', padding: '16px', borderRadius: '16px', border: '1px solid #2c2f36', marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#ccc' }}>Provide Liquidity</h3>
                    <p style={{ fontSize: '0.7rem', color: '#999', marginBottom: '1rem' }}>
                        Deposit assets to earn swap fees and enable instant cross-chain liquidity.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="btn btn-secondary"
                            style={{ flex: 1, fontSize: '12px', padding: '8px' }}
                            onClick={async () => {
                                if (!address || !signer || !tokenIn || !amountIn) {
                                    toast.error("Set token and amount above to provide liquidity");
                                    return;
                                }
                                try {
                                    const bridge = getContract('BRIDGE_SWAP_MAIN');
                                    if (!bridge) throw new Error("Bridge contract not found");

                                    const amountWei = tokenIn.assetType === AssetType.ERC721
                                        ? BigInt(amountIn)
                                        : ethers.parseUnits(amountIn, tokenIn.decimals);

                                    setStatus({ type: 'loading', message: 'Providing liquidity...' });

                                    // Approval (if needed)
                                    if (tokenIn.address !== ethers.ZeroAddress) {
                                        const erc20 = new ethers.Contract(tokenIn.address, ABIS.ERC20, signer);
                                        const bridgeAddr = await bridge.getAddress();
                                        const allowance = await erc20.allowance(address, bridgeAddr);
                                        if (allowance < amountWei) {
                                            const appTx = await erc20.approve(bridgeAddr, ethers.MaxUint256);
                                            await appTx.wait();
                                        }
                                    }

                                    const tx = await bridge.provideLiquidity(
                                        tokenIn.address,
                                        amountWei,
                                        { value: tokenIn.address === ethers.ZeroAddress ? amountWei : 0n }
                                    );
                                    await tx.wait();
                                    toast.success("Liquidity provided!");
                                    setStatus({ type: 'success', message: 'Liquidity Added!' });
                                } catch (e: any) {
                                    toast.error(e.message);
                                    setStatus({ type: 'error', message: 'Failed to add liquidity' });
                                }
                            }}
                        >
                            Deposit {tokenIn?.symbol}
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ flex: 1, fontSize: '12px', padding: '8px' }}
                            onClick={async () => {
                                if (!address || !signer || !tokenIn || !amountIn) {
                                    toast.error("Set token and amount above to withdraw");
                                    return;
                                }
                                try {
                                    const bridge = getContract('BRIDGE_SWAP_MAIN');
                                    if (!bridge) throw new Error("Bridge contract not found");

                                    const amountWei = tokenIn.assetType === AssetType.ERC721
                                        ? BigInt(amountIn)
                                        : ethers.parseUnits(amountIn, tokenIn.decimals);

                                    setStatus({ type: 'loading', message: 'Withdrawing liquidity...' });
                                    const tx = await bridge.withdrawLiquidity(tokenIn.address, amountWei);
                                    await tx.wait();
                                    toast.success("Liquidity withdrawn!");
                                    setStatus({ type: 'success', message: 'Liquidity Withdrawn!' });
                                } catch (e: any) {
                                    toast.error(e.message);
                                    setStatus({ type: 'error', message: 'Failed to withdraw' });
                                }
                            }}
                        >
                            Withdraw {tokenIn?.symbol}
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            <TokenModal
                isOpen={isTokenInModalOpen}
                onClose={() => setIsTokenInModalOpen(false)}
                onSelect={setTokenIn}
                selectedTokenAddress={tokenIn?.address}
            />
            <TokenModal
                isOpen={isTokenOutModalOpen}
                onClose={() => setIsTokenOutModalOpen(false)}
                onSelect={setTokenOut}
                selectedTokenAddress={tokenOut?.address}
                customChainId={targetChainId}
                showAllChains={false} // We specifically want to show tokens from the SELECTED target chain
            />
        </div>
    );
}
