import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownUp, ArrowRight, Settings, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, Clock, Zap, RefreshCcw, Search, X, Eye,
  AlertTriangle, Target, Info, Loader2, Copy, Check, Shield, Lock, Wallet
} from 'lucide-react';
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react';
import { NETWORKS, CHAIN_ICONS } from '../config/networks.jsx';

import WALLET_SWAP_ABI from '../contracts/WalletSwapMain.json';
import ADDRESSES from '../contracts/addresses.json';
import ERC20_ABI from '../contracts/erc20.json';
import ERC721_ABI from '../contracts/erc721.json';
import ORDER_PROCESSOR_ABI from '../contracts/EulerLagrangeOrderProcessor.json';
import TOKEN_LIST from '../tokenlist.json';

function TokenSelectorModal({ isOpen, onClose, assets, onSelect, search, setSearch, title, balances, activeNetworkId }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        ref={ref}
        className="token-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
      >
        <div className="token-modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="token-search-wrap">
          <Search size={16} className="token-search-icon" />
          <input
            type="text"
            placeholder="Search by name or paste address..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="token-search-input"
            autoFocus
          />
        </div>
        <div className="token-list">
          {assets.length === 0 ? (
            <div className="token-empty">No tokens found for this network</div>
          ) : (
            assets.map(token => {
              const balKey = `${token.chainId}-${token.address.toLowerCase()}`;
              const bal = balances[balKey];
              return (
                <button
                  key={`${token.chainId}-${token.address}`}
                  className="token-item"
                  onClick={() => { onSelect(token); onClose(); }}
                >
                  <div className="token-item-left">
                    {token.logoURI ? (
                      <img src={token.logoURI} alt="" className="token-item-icon" onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div className="token-item-icon-fallback">{token.symbol?.charAt(0)}</div>
                    )}
                    <div>
                      <div className="token-item-symbol">{token.symbol}</div>
                      <div className="token-item-name">{token.name}</div>
                    </div>
                  </div>
                  {bal !== undefined && (
                    <div className="token-item-balance">{parseFloat(bal).toFixed(4)}</div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function SwapInfoPanel({ isNative, isNFT, isERC20, protocolFee, gasFee, totalCost, sellSymbol, currencySymbol, sellAmount }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="swap-info-panel">
      <button className={`swap-info-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={13} /> Custody &amp; Fees
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="swap-info-content">
          <div className="custody-grid">
            <div className="custody-card escrow">
              <div className="custody-card-header"><Lock size={12} /> Escrowed</div>
              <div className="custody-card-type">Native Tokens</div>
              <div className="custody-card-desc">Funds are held in the smart contract until your order is resolved</div>
              <div className="custody-card-statuses">
                <span className="custody-status-tag">Matched</span>
                <span className="custody-status-tag">Expired</span>
                <span className="custody-status-tag">Filled</span>
                <span className="custody-status-tag">Cancelled</span>
              </div>
            </div>
            <div className="custody-card wallet">
              <div className="custody-card-header"><Wallet size={12} /> In Your Wallet</div>
              <div className="custody-card-type">ERC-20 &amp; NFTs</div>
              <div className="custody-card-desc">Tokens stay in your wallet. Only approved for transfer on match</div>
              <div className="custody-card-statuses">
                <span className="custody-status-tag">Approved</span>
                <span className="custody-status-tag">Not locked</span>
              </div>
            </div>
          </div>
          <div className="fee-breakdown">
            <div className="fee-breakdown-title">Fee Breakdown</div>
            {isNative && (
              <>
                <div className="fee-row">
                  <span className="fee-row-label">Protocol Fee (0.1%)</span>
                  <span className="fee-row-value">{protocolFee} {sellSymbol}</span>
                </div>
                <div className="fee-row">
                  <span className="fee-row-label">Gas Deposit</span>
                  <span className="fee-row-value">{gasFee} {currencySymbol}</span>
                </div>
                <div className="fee-row total">
                  <span className="fee-row-label">Total Cost</span>
                  <span className="fee-row-value">{totalCost} {sellSymbol}</span>
                </div>
              </>
            )}
            {isERC20 && (
              <>
                <div className="fee-row">
                  <span className="fee-row-label">Protocol Fee (0.05%)</span>
                  <span className="fee-row-value">{protocolFee} {sellSymbol}</span>
                </div>
                <div className="fee-row">
                  <span className="fee-row-label">Gas Deposit</span>
                  <span className="fee-row-value">{gasFee} {currencySymbol}</span>
                </div>
                <div className="fee-row total">
                  <span className="fee-row-label">Total Cost</span>
                  <span className="fee-row-value">{totalCost}</span>
                </div>
              </>
            )}
            {isNFT && (
              <>
                <div className="fee-row">
                  <span className="fee-row-label">Protocol Fee</span>
                  <span className="fee-row-value">None</span>
                </div>
                <div className="fee-row">
                  <span className="fee-row-label">Gas Deposit</span>
                  <span className="fee-row-value">{gasFee} {currencySymbol}</span>
                </div>
                <div className="fee-row total">
                  <span className="fee-row-label">Total Cost</span>
                  <span className="fee-row-value">{totalCost}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, activeNetwork, onCancel, onInspect, cancellingOrder }) {
  const isTemp = order.id.toString().startsWith('temp-');
  const currentTime = Math.floor(Date.now() / 1000);
  const isExpired = order.expiration && Number(order.expiration) < currentTime;

  let statusDisplay = (order.status || '').toString().toLowerCase();
  if (statusDisplay === 'active' && isExpired) statusDisplay = 'expired';

  const cancellableStatuses = ['published', 'pending', 'active', 'partial', 'matched', 'expired'];
  const isCorrectNetwork = order.network && BigInt(order.network.id) === BigInt(activeNetwork.id);
  const canCancel = isCorrectNetwork && (
    (cancellableStatuses.includes(statusDisplay) && !isTemp) ||
    (statusDisplay === 'published' && isTemp && order.txHash)
  );

  const fillPercent = order.rawAmountOut && BigInt(order.rawAmountOut) > 0n
    ? Number((BigInt(order.rawFilledAmount || '0') * 100n) / BigInt(order.rawAmountOut))
    : 0;

  const statusColors = {
    active: 'status-active',
    filled: 'status-filled',
    partial: 'status-partial',
    cancelled: 'status-cancelled',
    expired: 'status-expired',
    creating: 'status-creating',
    published: 'status-creating'
  };

  return (
    <motion.div
      className="order-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <div className="order-header">
        <div className="order-pair">
          <span className="order-token-symbol">{order.sellAsset?.symbol || '???'}</span>
          <ArrowRight size={14} className="order-arrow" />
          <span className="order-token-symbol">{order.buyAsset?.symbol || '???'}</span>
          {order.targetNetwork && activeNetwork.id !== order.targetNetwork.id && (
            <span className="cross-chain-badge">Cross-Chain</span>
          )}
        </div>
        <div className={`order-status ${statusColors[statusDisplay] || ''}`}>
          {isTemp ? (
            <><Loader2 size={12} className="spin" /> Syncing</>
          ) : statusDisplay === 'expired' ? (
            'Expired'
          ) : statusDisplay}
        </div>
      </div>

      <div className="order-details">
        <div className="order-amounts">
          <span>{order.sellAmount} {order.sellAsset?.symbol}</span>
          <ArrowRight size={12} className="order-arrow-sm" />
          <span>{order.buyAmount} {order.buyAsset?.symbol}</span>
        </div>

        {(statusDisplay === 'active' || statusDisplay === 'partial' || statusDisplay === 'filled') && (
          <div className="order-progress">
            <div className="order-progress-bar">
              <motion.div
                className="order-progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${fillPercent}%` }}
                transition={{ duration: 1 }}
              />
            </div>
            <span className="order-progress-text">{fillPercent}%</span>
          </div>
        )}

        <div className="order-meta">
          <span className="order-id">
            {isTemp ? 'Pending...' : `#${order.id.toString().substring(0, 8)}`}
          </span>
          <span className="order-time">{order.fullDate} {order.timestamp}</span>
        </div>
      </div>

      <div className="order-actions">
        <button className="order-action-btn inspect" onClick={() => onInspect(order.id)}>
          <Eye size={14} /> Inspect
        </button>
        {canCancel && (
          <button
            className="order-action-btn cancel"
            onClick={() => onCancel(order.id)}
            disabled={cancellingOrder === order.id}
          >
            {cancellingOrder === order.id ? (
              <><Loader2 size={14} className="spin" /> {isTemp ? 'Rescuing...' : 'Cancelling...'}</>
            ) : (
              <><X size={14} /> {statusDisplay === 'expired' ? 'Refund' : 'Cancel'}</>
            )}
          </button>
        )}
        {order.txHash && (
          <a
            href={`${activeNetwork.id === 146 ? 'https://sonicscan.org' : activeNetwork.id === 11155111 ? 'https://sepolia.etherscan.io' : '#'}/tx/${order.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="order-action-btn link"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </motion.div>
  );
}

export default function SwapPage() {
  const { open } = useWeb3Modal();
  const { address: account, chainId, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  const [activeNetwork, setActiveNetwork] = useState(NETWORKS[0]);
  const [targetNetwork, setTargetNetwork] = useState(NETWORKS[0]);
  const [showTargetChainDropdown, setShowTargetChainDropdown] = useState(false);

  useEffect(() => {
    if (chainId) {
      const matched = NETWORKS.find(n => BigInt(n.id) === BigInt(chainId));
      if (matched) {
        setActiveNetwork(matched);
        setTargetNetwork(matched);
      }
    }
  }, [chainId]);

  // Token state
  const [sellSearch, setSellSearch] = useState('');
  const [buySearch, setBuySearch] = useState('');
  const [showSellModal, setShowSellModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [tokenBalances, setTokenBalances] = useState({});

  const activeAssets = useMemo(() => {
    const chainFilter = t => BigInt(t.chainId) === BigInt(activeNetwork.id);
    return TOKEN_LIST?.tokens?.filter(chainFilter) || [];
  }, [activeNetwork]);

  const destAssets = useMemo(() => {
    const chainFilter = t => BigInt(t.chainId) === BigInt(targetNetwork.id);
    return TOKEN_LIST?.tokens?.filter(chainFilter) || [];
  }, [targetNetwork]);

  const filteredSellAssets = useMemo(() => {
    if (!sellSearch) return activeAssets;
    const s = sellSearch.toLowerCase();
    return activeAssets.filter(a => a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || a.address.toLowerCase() === s);
  }, [activeAssets, sellSearch]);

  const filteredBuyAssets = useMemo(() => {
    if (!buySearch) return destAssets;
    const s = buySearch.toLowerCase();
    return destAssets.filter(a => a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || a.address.toLowerCase() === s);
  }, [destAssets, buySearch]);

  const [sellAsset, setSellAsset] = useState(null);
  const [buyAsset, setBuyAsset] = useState(null);
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [expiryDuration, setExpiryDuration] = useState(3600);
  const [slippage, setSlippage] = useState(50); // basis points
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { if (activeAssets.length > 0) setSellAsset(activeAssets[0]); }, [activeNetwork.id, activeAssets]);
  useEffect(() => { if (destAssets.length > 0) setBuyAsset(destAssets[0]); }, [targetNetwork.id, destAssets]);

  // Orders
  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('autoswap_orders');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  useEffect(() => { localStorage.setItem('autoswap_orders', JSON.stringify(orders)); }, [orders]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('swap'); // swap | orders
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [inspectedOrder, setInspectedOrder] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const targetChainRef = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (targetChainRef.current && !targetChainRef.current.contains(e.target)) setShowTargetChainDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Balance fetching
  const fetchTokenBalances = useCallback(async () => {
    if (!account || activeAssets.length === 0) return;
    try {
      const balances = {};
      for (const asset of activeAssets) {
        const balanceKey = `${asset.chainId}-${asset.address.toLowerCase()}`;
        let provider;
        if (walletProvider && BigInt(activeNetwork.id) === BigInt(asset.chainId)) {
          provider = new ethers.BrowserProvider(walletProvider);
        } else {
          const net = NETWORKS.find(n => n.id === asset.chainId);
          if (net?.rpcUrl) provider = new ethers.JsonRpcProvider(net.rpcUrl);
          else continue;
        }
        try {
          if (asset.address === ethers.ZeroAddress || asset.address === '0x0000000000000000000000000000000000000000') {
            const bal = await provider.getBalance(account);
            balances[balanceKey] = ethers.formatEther(bal);
          } else {
            const contract = new ethers.Contract(asset.address, ERC20_ABI, provider);
            const bal = await contract.balanceOf(account);
            balances[balanceKey] = ethers.formatUnits(bal, asset.decimals);
          }
        } catch { balances[balanceKey] = '0'; }
      }
      setTokenBalances(balances);
    } catch (err) { console.error('Balance fetch failed:', err); }
  }, [account, activeAssets, walletProvider, activeNetwork]);

  useEffect(() => { fetchTokenBalances(); }, [fetchTokenBalances]);

  // History fetching
  const fetchHistory = useCallback(async () => {
    if (!account || !activeNetwork) return;
    try {
      setIsSyncingHistory(true);
      let effectiveProvider;
      if (walletProvider) effectiveProvider = new ethers.BrowserProvider(walletProvider);
      else effectiveProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);

      const cid = activeNetwork.id.toString();
      const processorAddress = ADDRESSES[cid]?.EulerLagrangeOrderProcessor;
      if (!processorAddress) { setIsSyncingHistory(false); return; }

      const processor = new ethers.Contract(processorAddress, ORDER_PROCESSOR_ABI.abi, effectiveProvider);
      const currentBlock = await effectiveProvider.getBlockNumber();
      const fromBlock = currentBlock > 1000000 ? currentBlock - 1000000 : 0;
      const normalizedAccount = ethers.getAddress(account);
      const filter = processor.filters.OrderCreated(null, normalizedAccount);

      let events = [];
      try { events = await processor.queryFilter(filter, fromBlock, 'latest'); }
      catch { const fb = currentBlock > 200000 ? currentBlock - 200000 : 0; events = await processor.queryFilter(filter, fb, 'latest'); }

      const historyPromises = events.map(async (event) => {
        const orderId = event.args.orderId;
        try {
          const order = await processor.getOrder(orderId);
          const sellAssetData = TOKEN_LIST.tokens.find(a => a.address.toLowerCase() === order.tokenIn.toLowerCase() && BigInt(a.chainId) === BigInt(activeNetwork.id)) || { symbol: '???', decimals: 18, chainId: activeNetwork.id };
          const buyAssetData = TOKEN_LIST.tokens.find(a => a.address.toLowerCase() === order.tokenOut.toLowerCase() && BigInt(a.chainId) === BigInt(order.targetChainId)) || { symbol: '???', decimals: 18, chainId: order.targetChainId.toString() };
          const targetNet = NETWORKS.find(n => BigInt(n.id) === BigInt(order.targetChainId)) || { name: 'Unknown', icon: 'eth', color: '#888', id: Number(order.targetChainId) };
          return {
            id: orderId.toString(), network: activeNetwork, targetNetwork: targetNet,
            sellAsset: sellAssetData, buyAsset: buyAssetData, maker: order.maker, txHash: event.transactionHash,
            sellAmount: ethers.formatUnits(order.amountIn, sellAssetData.decimals),
            buyAmount: ethers.formatUnits(order.amountOut, buyAssetData.decimals),
            filledAmount: ethers.formatUnits(order.filledAmount, buyAssetData.decimals),
            status: ['active', 'filled', 'partial', 'cancelled', 'expired'][Number(order.status)] || 'active',
            timestamp: new Date(Number(order.timestamp) * 1000).toLocaleTimeString(),
            fullDate: new Date(Number(order.timestamp) * 1000).toLocaleDateString(),
            expiration: order.expiration.toString(),
            tokenInAddr: order.tokenIn, tokenOutAddr: order.tokenOut,
            rawFilledAmount: order.filledAmount.toString(), rawAmountOut: order.amountOut.toString()
          };
        } catch {
          return {
            id: orderId.toString(), network: activeNetwork, sellAsset: { symbol: '???' }, buyAsset: { symbol: '???' },
            maker: event.args.maker, txHash: event.transactionHash, sellAmount: '?', buyAmount: '?', status: 'active', timestamp: 'Syncing...'
          };
        }
      });

      const results = await Promise.allSettled(historyPromises);
      const history = results.filter(r => r.status === 'fulfilled').map(r => r.value);

      setOrders(prevOrders => {
        const historyMap = new Map(history.map(h => [h.id.toString(), h]));
        const updatedOrders = prevOrders.map(o => {
          const oid = o.id.toString();
          if (oid.startsWith('temp-')) {
            const matched = history.find(h => h.txHash && o.txHash && h.txHash.toLowerCase() === o.txHash.toLowerCase());
            return matched || o;
          }
          const fresh = historyMap.get(oid);
          if (fresh && fresh.network.id === o.network.id) return { ...o, ...fresh };
          return o;
        });
        const tenMinsAgo = Date.now() - 10 * 60 * 1000;
        const finalOrders = updatedOrders.filter(o => {
          if (!o.id.toString().startsWith('temp-')) return true;
          const ts = parseInt(o.id.toString().split('-')[1]);
          return isNaN(ts) || ts > tenMinsAgo;
        });
        const existingIds = new Set(finalOrders.map(o => o.id.toString()));
        const newItems = history.filter(h => !existingIds.has(h.id.toString()));
        return [...newItems, ...finalOrders].sort((a, b) => {
          const aT = a.id.toString().startsWith('temp-');
          const bT = b.id.toString().startsWith('temp-');
          if (aT && !bT) return -1;
          if (!aT && bT) return 1;
          if (!aT && !bT) return b.id.toString().localeCompare(a.id.toString());
          return 0;
        });
      });
    } catch (err) { console.error("History fetch failed:", err); }
    finally { setIsSyncingHistory(false); }
  }, [account, activeNetwork, walletProvider]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 12000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const effectiveRate = useMemo(() => {
    if (!sellAmount || !buyAmount || parseFloat(sellAmount) === 0) return null;
    return (parseFloat(buyAmount) / parseFloat(sellAmount)).toFixed(6);
  }, [sellAmount, buyAmount]);

  const sellBalance = useMemo(() => {
    if (!sellAsset) return null;
    const key = `${sellAsset.chainId}-${sellAsset.address.toLowerCase()}`;
    return tokenBalances[key];
  }, [sellAsset, tokenBalances]);

  // Submit
  const handleSubmitIntent = async () => {
    if (!account || !walletProvider) return open();
    if (!sellAsset || !buyAsset || !sellAmount || !buyAmount) return;

    try {
      setIsSubmitting(true);
      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const cid = activeNetwork.id.toString();
      const contractAddress = ADDRESSES[cid]?.WalletSwapCallback || ADDRESSES[cid]?.WalletSwapMain;
      if (!contractAddress) { alert(`Contract not deployed on ${activeNetwork.name}`); return; }

      const walletSwap = new ethers.Contract(contractAddress, WALLET_SWAP_ABI.abi, signer);
      const sellAmountWei = ethers.parseUnits(sellAmount, sellAsset.decimals);
      const buyAmountWei = ethers.parseUnits(buyAmount, buyAsset.decimals);
      const MIN_GAS_FEE = ethers.parseEther("0.002");

      let valueToSend = MIN_GAS_FEE;
      if (sellAsset.address === ethers.ZeroAddress || sellAsset.address === '0x0000000000000000000000000000000000000000') {
        const fee = (sellAmountWei * 1n) / 1000n;
        valueToSend = sellAmountWei + fee + MIN_GAS_FEE;
      } else if (sellAsset.decimals === 0) {
        const nftContract = new ethers.Contract(sellAsset.address, ERC721_ABI, signer);
        const owner = await nftContract.ownerOf(sellAmountWei);
        if (owner.toLowerCase() !== account.toLowerCase()) throw new Error(`You do not own ${sellAsset.symbol} #${sellAmountWei}`);
        const isApproved = await nftContract.isApprovedForAll(account, contractAddress);
        if (!isApproved) { const tx = await nftContract.setApprovalForAll(contractAddress, true); await tx.wait(); }
      } else {
        const tokenContract = new ethers.Contract(sellAsset.address, ERC20_ABI, signer);
        const allowance = await tokenContract.allowance(account, contractAddress);
        const expectedFee = (sellAmountWei * 5n) / 10000n;
        const totalNeeded = sellAmountWei + expectedFee;
        if (allowance < totalNeeded) { const tx = await tokenContract.approve(contractAddress, ethers.MaxUint256); await tx.wait(); }
      }

      const tx = await walletSwap.createOrder(
        sellAsset.address, buyAsset.address,
        sellAsset.decimals === 0 ? 1 : 0, buyAsset.decimals === 0 ? 1 : 0,
        sellAmountWei, buyAmountWei,
        1000000000000000000n, 1000000000000000000n,
        slippage, expiryDuration, true, targetNetwork.id,
        { value: valueToSend }
      );

      const tempId = `temp-${Date.now()}`;
      setOrders(prev => [{
        id: tempId, txHash: tx.hash, network: activeNetwork, targetNetwork,
        sellAsset, buyAsset, sellAmount, buyAmount, maker: account,
        status: 'creating', timestamp: new Date().toLocaleTimeString(), fullDate: new Date().toLocaleDateString()
      }, ...prev]);

      const receipt = await tx.wait();

      // Extract orderId from receipt
      let realOrderId = null;
      try {
        const procIface = new ethers.Interface(ORDER_PROCESSOR_ABI.abi);
        const mainIface = new ethers.Interface(WALLET_SWAP_ABI.abi);
        const orderCreatedTopic = procIface.getEvent('OrderCreated').topicHash;
        const orderInitiatedTopic = mainIface.getEvent('OrderInitiated').topicHash;
        const extract = r => { for (const log of (r?.logs || [])) { if (log.topics?.[0] === orderCreatedTopic || log.topics?.[0] === orderInitiatedTopic) return log.topics[1]; } return null; };
        realOrderId = extract(receipt);

        if (!realOrderId) {
          const freshProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
          for (let i = 0; i < 5 && !realOrderId; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try { const fr = await freshProvider.getTransactionReceipt(receipt.hash); realOrderId = extract(fr); } catch {}
          }
        }
      } catch {}

      if (realOrderId) {
        try {
          const processorAddr = ADDRESSES[cid]?.EulerLagrangeOrderProcessor;
          const ep = new ethers.BrowserProvider(walletProvider);
          const processor = new ethers.Contract(processorAddr, ORDER_PROCESSOR_ABI.abi, ep);
          const onChainOrder = await processor.getOrder(realOrderId);
          const statusNames = ['active', 'filled', 'partial', 'cancelled', 'expired'];
          const resolvedStatus = statusNames[Number(onChainOrder.status)] || 'active';

          setOrders(prev => prev.map(o => o.id === tempId ? {
            ...o, id: realOrderId.toString(), txHash: receipt.hash, status: resolvedStatus,
            sellAmount: ethers.formatUnits(onChainOrder.amountIn, sellAsset.decimals),
            buyAmount: ethers.formatUnits(onChainOrder.amountOut, buyAsset.decimals),
            filledAmount: ethers.formatUnits(onChainOrder.filledAmount, buyAsset.decimals),
            timestamp: new Date(Number(onChainOrder.timestamp) * 1000).toLocaleTimeString(),
            fullDate: new Date(Number(onChainOrder.timestamp) * 1000).toLocaleDateString(),
            rawFilledAmount: onChainOrder.filledAmount.toString(), rawAmountOut: onChainOrder.amountOut.toString()
          } : o));
        } catch {
          setOrders(prev => prev.map(o => o.id === tempId ? { ...o, id: realOrderId.toString(), txHash: receipt.hash, status: 'active' } : o));
        }
      } else {
        setOrders(prev => prev.map(o => o.id === tempId ? { ...o, txHash: receipt.hash, status: 'published' } : o));
      }

      setSellAmount('');
      setBuyAmount('');
      setTimeout(fetchHistory, 3000);
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Transaction failed: " + (err.reason || err.message));
    } finally { setIsSubmitting(false); }
  };

  // Cancel
  const handleCancelOrder = async (orderId) => {
    if (!account || !walletProvider) return;
    let targetOrderId = orderId;
    const orderToCancel = orders.find(o => o.id === orderId);

    try {
      setCancellingOrder(orderId);
      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const cid = activeNetwork.id.toString();
      const contractAddress = ADDRESSES[cid]?.WalletSwapCallback || ADDRESSES[cid]?.WalletSwapMain;
      if (!contractAddress) return;

      const walletSwap = new ethers.Contract(contractAddress, WALLET_SWAP_ABI.abi, signer);

      if (orderId.toString().startsWith('temp-')) {
        if (!orderToCancel?.txHash) { alert("Order still syncing."); setCancellingOrder(null); return; }
        const freshProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
        const procIface = new ethers.Interface(ORDER_PROCESSOR_ABI.abi);
        const mainIface = new ethers.Interface(WALLET_SWAP_ABI.abi);
        const orderCreatedTopic = procIface.getEvent('OrderCreated').topicHash;
        const orderInitiatedTopic = mainIface.getEvent('OrderInitiated').topicHash;
        const extractId = r => { for (const log of (r?.logs || [])) { if (log.topics?.[0] === orderCreatedTopic || log.topics?.[0] === orderInitiatedTopic) return log.topics[1]; } return null; };

        for (let i = 0; i < 12 && targetOrderId.toString().startsWith('temp-'); i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 1500));
          try { const r = await freshProvider.getTransactionReceipt(orderToCancel.txHash); const f = extractId(r); if (f) { targetOrderId = f.toString(); setOrders(prev => prev.map(o => o.id === orderId ? { ...o, id: targetOrderId } : o)); } } catch {}
        }
      }

      if (targetOrderId.toString().startsWith('temp-')) {
        alert("Could not find Order ID on-chain. Please wait and try again.");
        setCancellingOrder(null);
        return;
      }

      // Pre-cancel check
      try {
        const processorAddr = ADDRESSES[cid]?.EulerLagrangeOrderProcessor;
        const processor = new ethers.Contract(processorAddr, ORDER_PROCESSOR_ABI.abi, provider);
        const onChainOrder = await processor.getOrder(targetOrderId);
        const statusNames = ['active', 'filled', 'partial', 'cancelled', 'expired'];
        const currentStatus = statusNames[Number(onChainOrder.status)] || 'unknown';
        if (currentStatus === 'filled') { alert("Order already filled!"); setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'filled', id: targetOrderId.toString() } : o)); setCancellingOrder(null); fetchHistory(); return; }
        if (currentStatus === 'cancelled') { alert("Order already cancelled."); setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled', id: targetOrderId.toString() } : o)); setCancellingOrder(null); return; }
      } catch {}

      const tx = await walletSwap.cancelOrder(targetOrderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled', id: targetOrderId.toString() } : o));
      await tx.wait();
      fetchHistory();
    } catch (err) {
      console.error("Cancellation failed:", err);
      alert("Failed to cancel: " + (err.reason || err.message));
    } finally { setCancellingOrder(null); }
  };

  // Inspect
  const handleInspectOrder = async (orderId) => {
    if (!orderId || orderId.toString().startsWith('temp-')) { alert("Order still syncing."); return; }
    try {
      setIsInspecting(true);
      setShowInspectModal(true);
      let provider;
      if (walletProvider) provider = new ethers.BrowserProvider(walletProvider);
      else provider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
      const processorAddress = ADDRESSES[activeNetwork.id.toString()]?.EulerLagrangeOrderProcessor;
      const processor = new ethers.Contract(processorAddress, ORDER_PROCESSOR_ABI.abi, provider);
      const order = await processor.getOrder(orderId);
      setInspectedOrder({
        id: orderId, maker: order.maker, tokenIn: order.tokenIn, tokenOut: order.tokenOut,
        amountIn: order.amountIn.toString(), amountOut: order.amountOut.toString(),
        filledAmount: order.filledAmount.toString(),
        status: ['ACTIVE', 'FILLED', 'PARTIAL', 'CANCELLED', 'EXPIRED'][Number(order.status)] || 'UNKNOWN',
        expiration: new Date(Number(order.expiration) * 1000).toLocaleString(),
        isExpired: Number(order.expiration) < Math.floor(Date.now() / 1000)
      });
    } catch (err) {
      console.error("Inspection failed:", err);
      alert("Failed to fetch on-chain data: " + (err.reason || err.message));
      setShowInspectModal(false);
    } finally { setIsInspecting(false); }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const swapTokens = () => {
    const tmpAsset = sellAsset;
    const tmpAmount = sellAmount;
    const tmpNet = activeNetwork;
    setSellAsset(buyAsset);
    setBuyAsset(tmpAsset);
    setSellAmount(buyAmount);
    setBuyAmount(tmpAmount);
  };

  const myOrders = useMemo(() => {
    return orders.filter(o => {
      try { return !account || ethers.getAddress(o.maker || '') === ethers.getAddress(account); }
      catch { return false; }
    });
  }, [orders, account]);

  const activeOrdersCount = useMemo(() => myOrders.filter(o => ['active', 'partial', 'creating', 'published'].includes((o.status || '').toLowerCase())).length, [myOrders]);

  const expiryOptions = [
    { label: '15m', value: 900 },
    { label: '1h', value: 3600 },
    { label: '4h', value: 14400 },
    { label: '24h', value: 86400 },
    { label: '7d', value: 604800 },
  ];

  const slippageOptions = [
    { label: '0.1%', value: 10 },
    { label: '0.5%', value: 50 },
    { label: '1%', value: 100 },
    { label: '3%', value: 300 },
  ];

  return (
    <div className="swap-page">
      <div className="swap-layout">
        {/* Main Swap Panel */}
        <div className="swap-panel-container">
          <div className="swap-panel">
            {/* Tabs */}
            <div className="swap-tabs">
              <button className={`swap-tab ${activeTab === 'swap' ? 'active' : ''}`} onClick={() => setActiveTab('swap')}>
                <ArrowDownUp size={16} /> Swap
              </button>
              <button className={`swap-tab ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
                <Clock size={16} /> Orders
                {activeOrdersCount > 0 && <span className="tab-badge">{activeOrdersCount}</span>}
              </button>
              <button className={`swap-tab-icon ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)}>
                <Settings size={16} />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {/* Settings */}
              {showSettings && (
                <motion.div key="settings" className="settings-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <div className="settings-section">
                    <label className="settings-label">Slippage Tolerance</label>
                    <div className="settings-options">
                      {slippageOptions.map(o => (
                        <button key={o.value} className={`settings-option ${slippage === o.value ? 'active' : ''}`} onClick={() => setSlippage(o.value)}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-section">
                    <label className="settings-label">Order Expiry</label>
                    <div className="settings-options">
                      {expiryOptions.map(o => (
                        <button key={o.value} className={`settings-option ${expiryDuration === o.value ? 'active' : ''}`} onClick={() => setExpiryDuration(o.value)}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'swap' && (
                <motion.div key="swap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Sell Input */}
                  <div className="swap-input-card">
                    <div className="swap-input-header">
                      <span className="swap-input-label">You Pay</span>
                      {sellBalance && (
                        <button className="swap-balance" onClick={() => setSellAmount(parseFloat(sellBalance).toFixed(6))}>
                          Balance: {parseFloat(sellBalance).toFixed(4)}
                        </button>
                      )}
                    </div>
                    <div className="swap-input-row">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={sellAmount}
                        onChange={e => setSellAmount(e.target.value)}
                        className="swap-amount-input"
                      />
                      <button className="token-select-btn" onClick={() => setShowSellModal(true)}>
                        {sellAsset?.logoURI && <img src={sellAsset.logoURI} alt="" className="token-btn-icon" onError={e => { e.target.style.display = 'none'; }} />}
                        <span>{sellAsset?.symbol || 'Select'}</span>
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <div className="swap-input-footer">
                      <span className="swap-chain-label">
                        {CHAIN_ICONS[activeNetwork.icon]}
                        <span>{activeNetwork.name}</span>
                      </span>
                    </div>
                  </div>

                  {/* Swap Direction Button */}
                  <div className="swap-direction-wrap">
                    <button className="swap-direction-btn" onClick={swapTokens}>
                      <ArrowDownUp size={18} />
                    </button>
                  </div>

                  {/* Buy Input */}
                  <div className="swap-input-card">
                    <div className="swap-input-header">
                      <span className="swap-input-label">You Receive</span>
                    </div>
                    <div className="swap-input-row">
                      <input
                        type="number"
                        placeholder="0.0"
                        value={buyAmount}
                        onChange={e => setBuyAmount(e.target.value)}
                        className="swap-amount-input"
                      />
                      <button className="token-select-btn" onClick={() => setShowBuyModal(true)}>
                        {buyAsset?.logoURI && <img src={buyAsset.logoURI} alt="" className="token-btn-icon" onError={e => { e.target.style.display = 'none'; }} />}
                        <span>{buyAsset?.symbol || 'Select'}</span>
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <div className="swap-input-footer">
                      <div className="target-chain-selector" ref={targetChainRef}>
                        <button className="swap-chain-label clickable" onClick={() => setShowTargetChainDropdown(!showTargetChainDropdown)}>
                          {CHAIN_ICONS[targetNetwork.icon]}
                          <span>{targetNetwork.name}</span>
                          <ChevronDown size={14} />
                        </button>
                        {showTargetChainDropdown && (
                          <div className="chain-dropdown">
                            {NETWORKS.map(n => (
                              <button key={n.id} className={`chain-dropdown-item ${n.id === targetNetwork.id ? 'active' : ''}`}
                                onClick={() => { setTargetNetwork(n); setShowTargetChainDropdown(false); }}>
                                {CHAIN_ICONS[n.icon]}
                                <span>{n.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rate Info */}
                  {effectiveRate && (
                    <div className="rate-info">
                      <Info size={14} />
                      <span>1 {sellAsset?.symbol} = {effectiveRate} {buyAsset?.symbol}</span>
                      <span className="rate-slippage">Slippage: {slippage / 100}%</span>
                    </div>
                  )}

                  {activeNetwork.id !== targetNetwork.id && (
                    <div className="cross-chain-notice">
                      <Zap size={14} />
                      <span>Cross-chain swap via Reactive Network</span>
                    </div>
                  )}

                  {/* Custody & Fee Info */}
                  {sellAsset && sellAmount && (() => {
                    const isNative = sellAsset.address === ethers.ZeroAddress || sellAsset.address === '0x0000000000000000000000000000000000000000';
                    const isNFT = sellAsset.decimals === 0;
                    const isERC20 = !isNative && !isNFT;
                    let protocolFee = '0';
                    let gasFee = '0.002';
                    let totalCost = '';
                    try {
                      const amt = parseFloat(sellAmount);
                      if (isNative) {
                        const pf = amt * 0.001;
                        protocolFee = pf.toFixed(6);
                        totalCost = (amt + pf + 0.002).toFixed(6);
                      } else if (isERC20) {
                        const pf = amt * 0.0005;
                        protocolFee = pf.toFixed(6);
                        totalCost = `${(amt + pf).toFixed(6)} ${sellAsset.symbol} + ${gasFee} ${activeNetwork.currency || 'ETH'}`;
                      } else {
                        totalCost = `Token #${sellAmount} + ${gasFee} ${activeNetwork.currency || 'ETH'}`;
                      }
                    } catch(e) {}
                    return (
                      <SwapInfoPanel
                        isNative={isNative} isNFT={isNFT} isERC20={isERC20}
                        protocolFee={protocolFee} gasFee={gasFee} totalCost={totalCost}
                        sellSymbol={sellAsset.symbol} currencySymbol={activeNetwork.currency || 'ETH'}
                        sellAmount={sellAmount}
                      />
                    );
                  })()}

                  {/* Submit Button */}
                  <button
                    className="swap-submit-btn"
                    onClick={handleSubmitIntent}
                    disabled={isSubmitting || (!isConnected) || !sellAmount || !buyAmount}
                  >
                    {isSubmitting ? (
                      <><Loader2 size={18} className="spin" /> Creating Order...</>
                    ) : !isConnected ? (
                      'Connect Wallet'
                    ) : !sellAmount || !buyAmount ? (
                      'Enter Amount'
                    ) : (
                      <><Target size={18} /> Create Swap Intent</>
                    )}
                  </button>
                </motion.div>
              )}

              {activeTab === 'orders' && (
                <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="orders-tab">
                  <div className="orders-header">
                    <span className="orders-count">{myOrders.length} orders</span>
                    <button className={`orders-sync-btn ${isSyncingHistory ? 'syncing' : ''}`} onClick={() => fetchHistory()}>
                      <RefreshCcw size={14} />
                    </button>
                  </div>
                  {myOrders.length === 0 ? (
                    <div className="orders-empty">
                      <Clock size={32} />
                      <p>No orders yet</p>
                      <span>Create your first swap intent above</span>
                    </div>
                  ) : (
                    <div className="orders-list">
                      {myOrders.map(order => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          activeNetwork={activeNetwork}
                          onCancel={handleCancelOrder}
                          onInspect={handleInspectOrder}
                          cancellingOrder={cancellingOrder}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Side Info Panel */}
        <div className="swap-info-panel">
          <div className="info-card">
            <div className="info-card-header">
              <Target size={18} />
              <h3>How Intents Work</h3>
            </div>
            <p>Unlike traditional swaps, intents let you specify exactly how much you want to receive. Your order is published to the Reactive Network where it's automatically matched with compatible counterparties.</p>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <Zap size={18} />
              <h3>Auto-Matching</h3>
            </div>
            <p>Orders on the same chain are matched instantly. Cross-chain orders are coordinated by the R-EVM, which monitors all registered chains and executes atomic swaps via callbacks.</p>
          </div>

          <div className="info-card">
            <div className="info-card-header">
              <Shield size={18} />
              <h3>Security</h3>
            </div>
            <ul className="info-list">
              <li><CheckCircle2 size={12} /> MEV & front-running protected</li>
              <li><CheckCircle2 size={12} /> Reentrancy guards on all functions</li>
              <li><CheckCircle2 size={12} /> On-chain solvency verification</li>
              <li><CheckCircle2 size={12} /> Automatic expired order refunds</li>
            </ul>
          </div>

          <div className="info-card stats">
            <div className="info-stat">
              <span className="info-stat-value">{myOrders.filter(o => o.status === 'filled').length}</span>
              <span className="info-stat-label">Filled</span>
            </div>
            <div className="info-stat">
              <span className="info-stat-value">{activeOrdersCount}</span>
              <span className="info-stat-label">Active</span>
            </div>
            <div className="info-stat">
              <span className="info-stat-value">{myOrders.filter(o => o.status === 'cancelled').length}</span>
              <span className="info-stat-label">Cancelled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Token Modals */}
      <AnimatePresence>
        {showSellModal && (
          <TokenSelectorModal
            isOpen={showSellModal}
            onClose={() => { setShowSellModal(false); setSellSearch(''); }}
            assets={filteredSellAssets}
            onSelect={setSellAsset}
            search={sellSearch}
            setSearch={setSellSearch}
            title="Select token to sell"
            balances={tokenBalances}
            activeNetworkId={activeNetwork.id}
          />
        )}
        {showBuyModal && (
          <TokenSelectorModal
            isOpen={showBuyModal}
            onClose={() => { setShowBuyModal(false); setBuySearch(''); }}
            assets={filteredBuyAssets}
            onSelect={setBuyAsset}
            search={buySearch}
            setSearch={setBuySearch}
            title="Select token to receive"
            balances={tokenBalances}
            activeNetworkId={targetNetwork.id}
          />
        )}
      </AnimatePresence>

      {/* Inspect Modal */}
      <AnimatePresence>
        {showInspectModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              className="inspect-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
            >
              <div className="inspect-header">
                <h3>Order Details</h3>
                <button className="modal-close" onClick={() => setShowInspectModal(false)}><X size={18} /></button>
              </div>
              {isInspecting ? (
                <div className="inspect-loading"><Loader2 size={24} className="spin" /> Loading on-chain data...</div>
              ) : inspectedOrder && (
                <div className="inspect-body">
                  <div className="inspect-status-badge" data-status={inspectedOrder.status}>
                    {inspectedOrder.status}
                    {inspectedOrder.isExpired && inspectedOrder.status === 'ACTIVE' && ' (EXPIRED)'}
                  </div>
                  <div className="inspect-grid">
                    <div className="inspect-field">
                      <span className="inspect-label">Order ID</span>
                      <div className="inspect-value mono">
                        <span>{inspectedOrder.id.toString().substring(0, 16)}...</span>
                        <button className="copy-btn" onClick={() => copyToClipboard(inspectedOrder.id.toString(), 'id')}>
                          {copiedField === 'id' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Maker</span>
                      <div className="inspect-value mono">
                        <span>{inspectedOrder.maker?.substring(0, 10)}...{inspectedOrder.maker?.slice(-6)}</span>
                        <button className="copy-btn" onClick={() => copyToClipboard(inspectedOrder.maker, 'maker')}>
                          {copiedField === 'maker' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Token In</span>
                      <div className="inspect-value mono">{inspectedOrder.tokenIn?.substring(0, 16)}...</div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Token Out</span>
                      <div className="inspect-value mono">{inspectedOrder.tokenOut?.substring(0, 16)}...</div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Amount In</span>
                      <div className="inspect-value">{inspectedOrder.amountIn}</div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Amount Out</span>
                      <div className="inspect-value">{inspectedOrder.amountOut}</div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Filled</span>
                      <div className="inspect-value">{inspectedOrder.filledAmount}</div>
                    </div>
                    <div className="inspect-field">
                      <span className="inspect-label">Expiration</span>
                      <div className="inspect-value">{inspectedOrder.expiration}</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
