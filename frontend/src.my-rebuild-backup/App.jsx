import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  ArrowDownUp,
  ArrowRight,
  Wallet,
  Layers,
  Settings,
  History as HistoryIcon,
  ChevronDown,
  ExternalLink,
  PlusCircle,
  CheckCircle2,
  Clock,
  Shield,
  Zap,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Menu,
  X,
  Search,
  Lock,
  Eye,
  Activity,
  Award,
  AlertTriangle,
  Flame,
  Moon,
  Sun,
  Gauge,
  Target,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react';

// 1. Get projectId
const projectId = '203fc7dc02b32d87c08c95ef9f038c00'; // Updated Project ID from user

// 2. Set chains
const sonicMainnet = {
  chainId: 146,
  name: 'Sonic Mainnet',
  currency: 'S',
  explorerUrl: 'https://sonicscan.org',
  rpcUrl: 'https://rpc.soniclabs.com'
};

const sonicTestnet = {
  chainId: 14601,
  name: 'Sonic Testnet',
  currency: 'S',
  explorerUrl: 'https://sonic-testnet.sonicscan.org', // Guessing URL, might need adjustment
  rpcUrl: 'https://rpc.testnet.soniclabs.com'
};

const lasna = {
  chainId: 5318007,
  name: 'Lasna',
  currency: 'REACT',
  explorerUrl: 'https://lasna-explorer.rnk.dev',
  rpcUrl: 'https://lasna-rpc.rnk.dev/'
};

const sepolia = {
  chainId: 11155111,
  name: 'Sepolia',
  currency: 'ETH',
  explorerUrl: 'https://sepolia.etherscan.io',
  rpcUrl: 'https://rpc.ankr.com/eth_sepolia'
};

const baseSepolia = {
  chainId: 84532,
  name: 'Base Sepolia',
  currency: 'ETH',
  explorerUrl: 'https://sepolia.basescan.org',
  rpcUrl: 'https://rpc.ankr.com/base_sepolia'
};

const coston = {
  chainId: 114,
  name: 'Coston',
  currency: 'FLR',
  explorerUrl: 'https://coston-explorer.flare.network',
  rpcUrl: 'https://coston-api.flare.network/ext/bc/C/rpc'
};

const coston2 = {
  chainId: 1597,
  name: 'Coston2',
  currency: 'FLR',
  explorerUrl: 'https://coston2-explorer.flare.network',
  rpcUrl: 'https://coston2-api.flare.network/ext/bc/C/rpc'
};

// 3. Create a metadata object
const metadata = {
  name: 'AutoSwap DApp',
  description: 'Intent-Based Swap DApp',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://autoswap.pages.dev',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// 4. Create Ethers config
const ethersConfig = defaultConfig({
  metadata,
  enableEIP6963: true,
  enableInjected: true,
  enableCoinbase: true,
  rpcUrl: sonicMainnet.rpcUrl // default RPC
});

// 5. Create Web3Modal
createWeb3Modal({
  ethersConfig,
  chains: [sonicMainnet, sonicTestnet, lasna, sepolia, baseSepolia, coston, coston2],
  projectId,
  enableAnalytics: true,
  allWallets: 'SHOW', // Ensure all wallets are shown in the explorer
  enableOnramp: true
});

// Real Contract ABIs and Addresses
import WALLET_SWAP_ABI from './contracts/WalletSwapMain.json';
import ADDRESSES from './contracts/addresses.json';
import ERC20_ABI from './contracts/erc20.json';
import ERC721_ABI from './contracts/erc721.json';
import ORDER_PROCESSOR_ABI from './contracts/EulerLagrangeOrderProcessor.json';

// Build Version for Cache Verification
const BUILD_VERSION = "2026-03-04.2045";

// Contract ABIs and Addresses
const NETWORKS = [
  { id: 146, name: 'Sonic Mainnet', icon: '⚡', color: '#B300FF', chainIdHex: '0x92', rpcUrl: sonicMainnet.rpcUrl },
  { id: 14601, name: 'Sonic Testnet', icon: '⚡', color: '#B300FF', chainIdHex: '0x3909', rpcUrl: sonicTestnet.rpcUrl },
  { id: 5318007, name: 'Lasna', icon: '🔵', color: '#00B3FF', chainIdHex: '0x512577', rpcUrl: lasna.rpcUrl },
  { id: 11155111, name: 'Sepolia', icon: '💎', color: '#627EEA', chainIdHex: '0xaa36a7', rpcUrl: sepolia.rpcUrl },
  { id: 84532, name: 'Base Sepolia', icon: '🔵', color: '#0052FF', chainIdHex: '0x14a34', rpcUrl: baseSepolia.rpcUrl },
  { id: 114, name: 'Coston', icon: '🛡️', color: '#E12D3A', chainIdHex: '0x72', rpcUrl: coston.rpcUrl },
  { id: 1597, name: 'Coston2', icon: '🛡️', color: '#E12D3A', chainIdHex: '0x63d', rpcUrl: coston2.rpcUrl }
];

import TOKEN_LIST from './tokenlist.json';
import MarketplacePage from './marketplace/MarketplacePage.jsx';


const getNetworkAssets = (networkId) => {
  if (!TOKEN_LIST || !TOKEN_LIST.tokens) return [];
  return TOKEN_LIST.tokens.filter(token => BigInt(token.chainId) === BigInt(networkId));
};

function App() {
  const { open } = useWeb3Modal();
  const { address: account, chainId, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  const [activeNetwork, setActiveNetwork] = useState(NETWORKS[0]);

  // Sync activeNetwork with Web3Modal chainId
  useEffect(() => {
    if (chainId) {
      const matched = NETWORKS.find(n => BigInt(n.id) === BigInt(chainId));
      if (matched) {
        setActiveNetwork(matched);
        setTargetNetwork(matched); // Default target to active network
      }
    }
  }, [chainId]);

  const [targetNetwork, setTargetNetwork] = useState(NETWORKS[0]);
  const [showTargetNetworkDropdown, setShowTargetNetworkDropdown] = useState(false);

  const [currentView, setCurrentView] = useState('landing'); // landing, intents, history, security, settings
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const [externalTokens, setExternalTokens] = useState([]);
  const [customTokens, setCustomTokens] = useState(() => {
    try {
      const saved = localStorage.getItem('autoswap_custom_tokens');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return [];
  });

  const [sellSearch, setSellSearch] = useState('');
  const [buySearch, setBuySearch] = useState('');

  // Custom Token Modal State
  const [showAddCustomTokenModal, setShowAddCustomTokenModal] = useState(false);
  const [customTokenAddressInput, setCustomTokenAddressInput] = useState('');
  const [customTokenPreview, setCustomTokenPreview] = useState(null);
  const [isFetchingCustomToken, setIsFetchingCustomToken] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [inspectedOrder, setInspectedOrder] = useState(null);
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [activeOrderTracking, setActiveOrderTracking] = useState(null); // ID of the order currently being tracked in the swap panel

  const auditFixes = [
    "Fixed reentrancy vulnerability in EulerLagrangeOrderProcessor",
    "Resolved front-running issue in AssetVerifier",
    "Patched integer overflow in TrustWalletFeeDistributor fee calculation",
    "Corrected cross-chain message replay attack vector",
    "Fixed incorrect nonce incrementation during concurrent intent creation",
    "Mitigated sandwich attack vector in SwapMatcherMultiChain",
    "Fixed unauthorized order cancellation bug in WalletSwapMain",
    "Resolved precision loss in multi-hop swap calculations",
    "Added slippage bounds validation to prevent MEV exploitation",
    "Fixed missing ERC-721 interface support in NFT swap logic",
    "Addressed infinite approval loop in Token Allowance checking",
    "Fixed state poisoning in VirtualLiquidityPool",
    "Updated chain ID validation to prevent cross-chain signature replays",
    "Patched unhandled revert in custom external Oracle feeds",
    "Improved gas estimation to prevent out-of-gas order failures",
    "Fixed event emission missing critical indexing parameters",
    "Resolved race condition in order fulfillment settlement",
    "Corrected misaligned ABI encoding in LayerZero integration",
    "Fixed edge case allowing partial fills beyond max order amount",
    "Restricted admin fee withdrawal to multisig delays",
    "Addressed unchecked external call return values in SwapMatcher",
    "Fixed incorrect mapping deletion leading to stuck intents",
    "Updated EIP-712 domain separator logic for network upgrades",
    "Patched minor denial-of-service (DoS) vector in order array loop",
    "Improved zero-address checks in factory deployments",
    "Fixed edge-case calculation in time-weighted average price (TWAP) decay"
  ];

  // External token fetch disabled: we use local tokenlist.json only.
  // Each entry in tokenlist.json is already tagged with the correct chainId,
  // so the activeAssets memo filters it down to exactly the connected chain's tokens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { /* no-op: external fetch disabled */ }, []);

  const activeAssets = useMemo(() => {
    const chainFilter = (t) => BigInt(t.chainId) === BigInt(activeNetwork.id);

    const local = TOKEN_LIST?.tokens?.filter(chainFilter) || [];
    const external = externalTokens.filter(chainFilter);
    const custom = customTokens.filter(chainFilter);

    // Merge and deduplicate by address
    const seen = new Set();
    const merged = [];

    const addToken = (t) => {
      const key = t.address.toLowerCase();
      if (!seen.has(key)) {
        merged.push(t);
        seen.add(key);
      }
    };

    local.forEach(addToken);
    external.forEach(addToken);
    custom.forEach(addToken);

    return merged;
  }, [activeNetwork, externalTokens, customTokens]);

  const destAssets = useMemo(() => {
    const chainFilter = (t) => BigInt(t.chainId) === BigInt(targetNetwork.id);

    const local = TOKEN_LIST?.tokens?.filter(chainFilter) || [];
    const external = externalTokens.filter(chainFilter);
    const custom = customTokens.filter(chainFilter);

    // Merge and deduplicate by address
    const seen = new Set();
    const merged = [];

    const addToken = (t) => {
      const key = t.address.toLowerCase();
      if (!seen.has(key)) {
        merged.push(t);
        seen.add(key);
      }
    };

    local.forEach(addToken);
    external.forEach(addToken);
    custom.forEach(addToken);

    return merged;
  }, [targetNetwork, externalTokens, customTokens]);

  const filteredSellAssets = useMemo(() => {
    if (!sellSearch) return activeAssets;
    const s = sellSearch.toLowerCase();
    return activeAssets.filter(a =>
      a.symbol.toLowerCase().includes(s) ||
      a.name.toLowerCase().includes(s) ||
      a.address.toLowerCase() === s
    );
  }, [activeAssets, sellSearch]);

  const filteredBuyAssets = useMemo(() => {
    if (!buySearch) return destAssets;
    const s = buySearch.toLowerCase();
    return destAssets.filter(a =>
      a.symbol.toLowerCase().includes(s) ||
      a.name.toLowerCase().includes(s) ||
      a.address.toLowerCase() === s
    );
  }, [destAssets, buySearch]);

  // Intent-Based State
  const [sellAsset, setSellAsset] = useState(activeAssets[0] || { symbol: '?', address: '0x0', decimals: 18 });
  const [buyAsset, setBuyAsset] = useState(activeAssets[1] || { symbol: '?', address: '0x0', decimals: 18 });

  // Reset sell/buy tokens when active chain changes
  useEffect(() => {
    if (activeAssets.length > 0) {
      setSellAsset(activeAssets[0]);
    }
  }, [activeNetwork.id, activeAssets]);

  useEffect(() => {
    if (destAssets.length > 0) {
      setBuyAsset(destAssets[0] || destAssets[0]);
    }
  }, [targetNetwork.id, destAssets]);
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [tokenBalances, setTokenBalances] = useState({});
  const [showSellDropdown, setShowSellDropdown] = useState(false);
  const [showBuyDropdown, setShowBuyDropdown] = useState(false);
  const sellDropdownRef = useRef(null);
  const buyDropdownRef = useRef(null);

  const [orders, setOrders] = useState(() => {
    try {
      const saved = localStorage.getItem('autoswap_orders');
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('autoswap_orders', JSON.stringify(orders));
  }, [orders]);
  const [expiryDuration, setExpiryDuration] = useState(3600); // Default 1 hour in seconds
  const [cancellingOrder, setCancellingOrder] = useState(null);

  const fetchTokenBalances = useCallback(async () => {
    if (!account || activeAssets.length === 0) return;
    try {
      const balances = {};

      // Group assets by chainId
      const assetsByChain = activeAssets.reduce((acc, asset) => {
        if (!acc[asset.chainId]) acc[asset.chainId] = [];
        acc[asset.chainId].push(asset);
        return acc;
      }, {});

      // Fetch balances per chain
      await Promise.all(Object.entries(assetsByChain).map(async ([chainIdStr, assets]) => {
        const chainId = parseInt(chainIdStr, 10);
        const network = NETWORKS.find(n => n.id === chainId);

        let provider;
        // Optimization: use the connected wallet provider if checking the active chain, otherwise use public RPC
        if (walletProvider && activeNetwork?.id === chainId) {
          provider = new ethers.BrowserProvider(walletProvider);
        } else if (network?.rpcUrl) {
          provider = new ethers.JsonRpcProvider(network.rpcUrl);
        } else {
          return; // Skip if no provider can be established
        }

        for (const asset of assets) {
          const balanceKey = `${asset.chainId}-${asset.address.toLowerCase()}`;
          if (asset.address === ethers.ZeroAddress || asset.address === '0x0000000000000000000000000000000000000000') {
            try {
              const bal = await provider.getBalance(account);
              balances[balanceKey] = ethers.formatEther(bal);
            } catch (e) {
              balances[balanceKey] = '0';
            }
          } else {
            try {
              const contract = new ethers.Contract(asset.address, ERC20_ABI, provider);
              const bal = await contract.balanceOf(account);
              balances[balanceKey] = ethers.formatUnits(bal, asset.decimals);
            } catch (e) {
              balances[balanceKey] = '0';
            }
          }
        }
      }));

      setTokenBalances(balances);
    } catch (err) {
      console.error('Failed to fetch token balances:', err);
    }
  }, [account, activeAssets, walletProvider, activeNetwork]);

  useEffect(() => {
    fetchTokenBalances();
  }, [fetchTokenBalances]);

  const fetchHistory = useCallback(async () => {
    if (!account || !activeNetwork) return;

    try {
      setIsSyncingHistory(true);
      let effectiveProvider;
      if (walletProvider) {
        effectiveProvider = new ethers.BrowserProvider(walletProvider);
      } else {
        effectiveProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
      }

      const chainId = activeNetwork.id.toString();
      const processorAddress = ADDRESSES[chainId]?.EulerLagrangeOrderProcessor;
      if (!processorAddress) {
        setIsSyncingHistory(false);
        return;
      }

      const processor = new ethers.Contract(processorAddress, ORDER_PROCESSOR_ABI.abi, effectiveProvider);

      const currentBlock = await effectiveProvider.getBlockNumber();
      // Reduced range to 1M blocks for safer RPC queries. 10M blocks often triggers "limit exceeded".
      const fromBlock = currentBlock > 1000000 ? currentBlock - 1000000 : 0;

      const normalizedAccount = ethers.getAddress(account);
      const filter = processor.filters.OrderCreated(null, normalizedAccount);

      let events = [];
      try {
        events = await processor.queryFilter(filter, fromBlock, 'latest');
      } catch (rangeErr) {
        console.warn("RPC Range error, falling back to 200k blocks:", rangeErr);
        const fallbackFrom = currentBlock > 200000 ? currentBlock - 200000 : 0;
        events = await processor.queryFilter(filter, fallbackFrom, 'latest');
      }

      // Parallel fetching with individual error boundaries
      const historyPromises = events.map(async (event) => {
        const orderId = event.args.orderId;
        try {
          const order = await processor.getOrder(orderId);
          const sellAssetData = TOKEN_LIST.tokens.find(a => a.address.toLowerCase() === order.tokenIn.toLowerCase() && BigInt(a.chainId) === BigInt(activeNetwork.id)) || { symbol: '???', decimals: 18, icon: '❓', chainId: activeNetwork.id };
          const buyAssetData = TOKEN_LIST.tokens.find(a => a.address.toLowerCase() === order.tokenOut.toLowerCase() && BigInt(a.chainId) === BigInt(order.targetChainId)) || { symbol: '???', decimals: 18, icon: '❓', chainId: order.targetChainId.toString() };

          const targetNet = NETWORKS.find(n => BigInt(n.id) === BigInt(order.targetChainId)) || { name: 'Unknown', icon: '❓', color: '#888' };

            return {
              id: orderId.toString(),
              network: activeNetwork,
              targetNetwork: targetNet,
              sellAsset: sellAssetData,
              buyAsset: buyAssetData,
              maker: order.maker,
              txHash: event.transactionHash,
              sellAmount: ethers.formatUnits(order.amountIn, sellAssetData.decimals),
              buyAmount: ethers.formatUnits(order.amountOut, buyAssetData.decimals),
              filledAmount: ethers.formatUnits(order.filledAmount, buyAssetData.decimals),
              status: ['active', 'filled', 'partial', 'cancelled', 'expired'][Number(order.status)] || 'active',
              timestamp: new Date(Number(order.timestamp) * 1000).toLocaleTimeString(),
              fullDate: new Date(Number(order.timestamp) * 1000).toLocaleDateString(),
              expiration: order.expiration.toString(),
              tokenInAddr: order.tokenIn,
              tokenOutAddr: order.tokenOut,
              rawFilledAmount: order.filledAmount.toString(),
              rawAmountOut: order.amountOut.toString()
            };
        } catch (orderErr) {
          console.error(`Failed to fetch details for order ${orderId}:`, orderErr);
          const sAsset = TOKEN_LIST.tokens.find(a => a.address.toLowerCase() === (event.args.tokenIn || '').toLowerCase() && BigInt(a.chainId) === BigInt(activeNetwork.id)) || { symbol: '???', decimals: 18 };
          const bAsset = TOKEN_LIST.tokens.find(a => a.address.toLowerCase() === (event.args.tokenOut || '').toLowerCase()) || { symbol: '???', decimals: 18 }; // fallback search chain might not be known yet
          const targetNet = NETWORKS.find(n => BigInt(n.id) === BigInt(event.args.targetChainId || activeNetwork.id)) || { name: 'Unknown', icon: '❓' };

          return {
            id: orderId.toString(),
            network: activeNetwork,
            targetNetwork: targetNet,
            sellAsset: sAsset,
            buyAsset: bAsset,
            maker: event.args.maker,
            txHash: event.transactionHash,
            sellAmount: ethers.formatUnits(event.args.amountIn, sAsset.decimals),
            buyAmount: ethers.formatUnits(event.args.amountOut, bAsset.decimals),
            status: 'active',
            timestamp: 'Syncing...',
            isResilientFallback: true
          };
        }
      });

      const results = await Promise.allSettled(historyPromises);
      const history = results.filter(r => r.status === 'fulfilled').map(r => r.value);

      setOrders(prevOrders => {
        // Robust merging: Map exists first to avoid O(n^2) behavior
        const historyMap = new Map(history.map(h => [h.id.toString(), h]));

        const updatedOrders = prevOrders.map(o => {
          const oid = o.id.toString();
          if (oid.startsWith('temp-')) {
            const matched = history.find(h => {
              if (h.txHash && o.txHash && h.txHash.toLowerCase() === o.txHash.toLowerCase()) return true;
              try {
                const hAmountIn = ethers.parseUnits(h.sellAmount, h.sellAsset.decimals);
                const oAmountIn = ethers.parseUnits(o.sellAmount, o.sellAsset.decimals);
                const hAmountOut = ethers.parseUnits(h.buyAmount, h.buyAsset.decimals);
                const oAmountOut = ethers.parseUnits(o.buyAmount, o.buyAsset.decimals);
                return hAmountIn === oAmountIn &&
                  hAmountOut === oAmountOut &&
                  ethers.getAddress(h.sellAsset.address) === ethers.getAddress(o.sellAsset.address);
              } catch (e) { return false; }
            });
            return matched ? matched : o;
          }
          const freshHistoryItem = historyMap.get(oid);
          if (freshHistoryItem && freshHistoryItem.network.id === o.network.id) {
            return { ...o, ...freshHistoryItem };
          }
          return o;
        });

        const tenMinsAgo = Date.now() - 10 * 60 * 1000;
        const finalOrders = updatedOrders.filter(o => {
          if (!o.id.toString().startsWith('temp-')) return true;
          const ts = parseInt(o.id.toString().split('-')[1]);
          return isNaN(ts) || ts > tenMinsAgo;
        });

        const existingIds = new Set(finalOrders.map(o => o.id.toString()));
        const newHistoryItems = history.filter(h => !existingIds.has(h.id.toString()));

        return [...newHistoryItems, ...finalOrders].sort((a, b) => {
          const aid = a.id.toString();
          const bid = b.id.toString();
          const aIsTemp = aid.startsWith('temp-');
          const bIsTemp = bid.startsWith('temp-');

          if (aIsTemp && !bIsTemp) return -1;
          if (!aIsTemp && bIsTemp) return 1;

          // Safer numeric/hex sorting for persistent IDs
          if (!aIsTemp && !bIsTemp) {
            if (aid.length !== bid.length) return bid.length - aid.length;
            return bid.localeCompare(aid);
          }
          return 0;
        });
      });
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setIsSyncingHistory(false);
    }
  }, [account, activeNetwork, walletProvider, activeAssets]);

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 12000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const activeIntentsCount = useMemo(() => {
    return orders.filter(o => o.status === 'pending' || o.status === 'matched' || o.status === 'published' || o.status === 'creating').length;
  }, [orders]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Settings State
  const [slippage, setSlippage] = useState('0.5%');
  const [gasSpeed, setGasSpeed] = useState('Standard');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Dynamic Ticker State
  const [swapStats, setSwapStats] = useState({
    ETH: 5, USDC: 2, DAI: 1, LINK: 3, SOL: 0
  });

  const trendingAsset = useMemo(() => {
    return Object.entries(swapStats).reduce((a, b) => a[1] > b[1] ? a : b)[0];
  }, [swapStats]);

  const effectiveRate = useMemo(() => {
    if (!sellAmount || !buyAmount || parseFloat(sellAmount) === 0) return null;
    return (parseFloat(buyAmount) / parseFloat(sellAmount)).toFixed(4);
  }, [sellAmount, buyAmount]);

  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNetworkDropdown(false);
      }
      if (sellDropdownRef.current && !sellDropdownRef.current.contains(event.target)) {
        setShowSellDropdown(false);
      }
      if (buyDropdownRef.current && !buyDropdownRef.current.contains(event.target)) {
        setShowBuyDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const connectWallet = async () => {
    open();
  };

  const switchNetwork = async (network) => {
    setShowNetworkDropdown(false);
    open({ view: 'Networks' });
  };

  // Web3Modal handles accounts and chain changes automatically via hooks.
  // No need for window.ethereum listeners here.

  const handleSubmitIntent = async () => {
    if (!account || !walletProvider) return connectWallet();

    try {
      setIsSubmitting(true);
      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();

      const chainId = activeNetwork.id.toString();
      const contractAddress = ADDRESSES[chainId]?.WalletSwapCallback || ADDRESSES[chainId]?.WalletSwapMain;

      if (!contractAddress) {
        alert(`Contract not deployed on ${activeNetwork.name}`);
        setIsSubmitting(false);
        return;
      }

      const walletSwap = new ethers.Contract(contractAddress, WALLET_SWAP_ABI.abi, signer);

      // Parse amounts based on decimals
      const sellAmountWei = ethers.parseUnits(sellAmount, sellAsset.decimals);
      const buyAmountWei = ethers.parseUnits(buyAmount, buyAsset.decimals);

      // Min Gas Fee requirement from contract
      const MIN_GAS_FEE = ethers.parseEther("0.002");

      // Calculate total value to send if native ETH
      let valueToSend = MIN_GAS_FEE;
      if (sellAsset.address === ethers.ZeroAddress) {
        // For native ETH, we need to send the amount + fee (mocked at 0.1% here) + gas fee
        // In real app, we should call feeDistributor.calculateFee
        const fee = (sellAmountWei * 1n) / 1000n; // 0.1% mock
        valueToSend = sellAmountWei + fee + MIN_GAS_FEE;
      } else if (sellAsset.decimals === 0) {
        // For ERC721 (NFT), check approval
        const nftContract = new ethers.Contract(sellAsset.address, ERC721_ABI, signer);

        // 1. Verify ownership first
        try {
          const owner = await nftContract.ownerOf(sellAmountWei); // sellAmountWei is tokenId
          if (owner.toLowerCase() !== account.toLowerCase()) {
            throw new Error(`You do not own ${sellAsset.symbol} #${sellAmountWei}`);
          }
        } catch (e) {
          throw new Error(`Failed to verify ownership of ${sellAsset.symbol} #${sellAmountWei}. Error: ${e.message}`);
        }

        const isApproved = await nftContract.isApprovedForAll(account, contractAddress);
        if (!isApproved) {
          console.log("Approving NFT...");
          const tx = await nftContract.setApprovalForAll(contractAddress, true);
          await tx.wait();
          console.log("NFT Approved.");
        }
      } else {
        // For ERC20, check allowance
        const tokenContract = new ethers.Contract(sellAsset.address, ERC20_ABI, signer);
        const allowance = await tokenContract.allowance(account, contractAddress);

        // Include 0.05% fee in the check (basis points: 5 / 10000)
        const expectedFee = (sellAmountWei * 5n) / 10000n;
        const totalNeeded = sellAmountWei + expectedFee;

        if (allowance < totalNeeded) {
          console.log("Approving...");
          // Approve slightly more or MaxUint256 to handle future minor fee calculations
          const tx = await tokenContract.approve(contractAddress, ethers.MaxUint256);
          await tx.wait();
          console.log("Approved.");
        }
      }

      const sellAssetType = sellAsset.decimals === 0 ? 1 : 0;
      const buyAssetType = buyAsset.decimals === 0 ? 1 : 0;

      console.log("Creating Order...");
      const tx = await walletSwap.createOrder(
        sellAsset.address,
        buyAsset.address,
        sellAssetType, // Dynamically parsed AssetType
        buyAssetType, // Dynamically parsed AssetType
        sellAmountWei,
        buyAmountWei,
        1000000000000000000n, // minutesValueIn (needs to be > 0 for contract validation)
        1000000000000000000n, // minutesValueOut (needs to be > 0 for contract validation)
        50, // 0.5% slippage (50 bps)
        expiryDuration, // Selected duration from settings
        true, // enableRebooking
        targetNetwork.id, // targetChainId (cross-chain support)
        { value: valueToSend }
      );

      // Add optimistic order
      const tempId = `temp-${Date.now()}`;
      const creatingOrder = {
        id: tempId,
        txHash: tx.hash,
        network: activeNetwork,
        sellAsset: sellAsset,
        buyAsset: buyAsset,
        sellAmount: sellAmount,
        buyAmount: buyAmount,
        maker: account,
        status: 'creating',
        timestamp: new Date().toLocaleTimeString(),
        fullDate: new Date().toLocaleDateString()
      };
      setOrders(prev => [creatingOrder, ...prev]);
      setActiveOrderTracking(tempId);

      const receipt = await tx.wait();
      console.log("Order Created:", receipt.hash);

      // Extract real orderId from logs — topic-based extraction (bulletproof)
      // orderId is the FIRST indexed param in both OrderCreated and OrderInitiated,
      // so it always appears as topics[1] in the log entry.
      let realOrderId = null;
      try {
        const procIface = new ethers.Interface(ORDER_PROCESSOR_ABI.abi);
        const mainIface = new ethers.Interface(WALLET_SWAP_ABI.abi);

        // Compute topic hashes for matching
        const orderCreatedTopic = procIface.getEvent('OrderCreated').topicHash;
        const orderInitiatedTopic = mainIface.getEvent('OrderInitiated').topicHash;

        // Helper: scan a receipt's logs for the orderId
        const extractFromReceipt = (r) => {
          for (const log of (r?.logs || [])) {
            const topic0 = log.topics?.[0];
            if (topic0 === orderCreatedTopic || topic0 === orderInitiatedTopic) {
              return log.topics[1];
            }
          }
          return null;
        };

        console.log(`Receipt has ${receipt.logs.length} logs. Looking for OrderCreated(${orderCreatedTopic.slice(0, 10)}) or OrderInitiated(${orderInitiatedTopic.slice(0, 10)})`);

        realOrderId = extractFromReceipt(receipt);

        // Sonic RPC can return receipts with missing logs on first delivery — retry up to 5 times
        if (!realOrderId) {
          console.warn("orderId not found in initial receipt — retrying via RPC (Sonic lag)...");
          const freshProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
          for (let attempt = 0; attempt < 5 && !realOrderId; attempt++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
              const freshReceipt = await freshProvider.getTransactionReceipt(receipt.hash);
              realOrderId = extractFromReceipt(freshReceipt);
              if (realOrderId) console.log(`Found orderId on retry #${attempt + 1}:`, realOrderId);
            } catch (retryErr) {
              console.warn(`Receipt retry #${attempt + 1} failed:`, retryErr.message);
            }
          }
        }

        if (!realOrderId) {
          console.warn("No OrderCreated/OrderInitiated event found after retries. Topics:", receipt.logs.map(l => l.topics?.[0]?.slice(0, 10)));
        }
      } catch (err) {
        console.error("Failed to extract orderId from logs:", err);
      }

      // Instant post-creation status resolution: check real on-chain status immediately
      if (realOrderId) {
        try {
          const chainId = activeNetwork.id.toString();
          const processorAddr = ADDRESSES[chainId]?.EulerLagrangeOrderProcessor;
          const effectiveProvider = new ethers.BrowserProvider(walletProvider);
          const processor = new ethers.Contract(processorAddr, ORDER_PROCESSOR_ABI.abi, effectiveProvider);
          const onChainOrder = await processor.getOrder(realOrderId);

          const statusNames = ['active', 'filled', 'partial', 'cancelled', 'expired'];
          const resolvedStatus = statusNames[Number(onChainOrder.status)] || 'active';

          const sellAssetData = activeAssets.find(a => a.address.toLowerCase() === onChainOrder.tokenIn.toLowerCase()) || sellAsset;
          const buyAssetData = activeAssets.find(a => a.address.toLowerCase() === onChainOrder.tokenOut.toLowerCase()) || buyAsset;

          setOrders(prev => prev.map(o =>
            o.id === tempId ? {
              ...o,
              id: realOrderId.toString(),
              txHash: receipt.hash,
              status: resolvedStatus,
              sellAsset: sellAssetData,
              buyAsset: buyAssetData,
              sellAmount: ethers.formatUnits(onChainOrder.amountIn, sellAssetData.decimals),
              buyAmount: ethers.formatUnits(onChainOrder.amountOut, buyAssetData.decimals),
              filledAmount: ethers.formatUnits(onChainOrder.filledAmount, buyAssetData.decimals),
              timestamp: new Date(Number(onChainOrder.timestamp) * 1000).toLocaleTimeString(),
              fullDate: new Date(Number(onChainOrder.timestamp) * 1000).toLocaleDateString(),
              tokenInAddr: onChainOrder.tokenIn,
              tokenOutAddr: onChainOrder.tokenOut,
              rawFilledAmount: onChainOrder.filledAmount.toString(),
              rawAmountOut: onChainOrder.amountOut.toString()
            } : o
          ));

          if (resolvedStatus === 'filled') {
            console.log("Order was auto-matched and filled instantly!");
          }
        } catch (statusErr) {
          console.warn("Could not fetch instant status, falling back:", statusErr);
          setOrders(prev => prev.map(o =>
            o.id === tempId ? {
              ...o,
              id: realOrderId.toString(),
              txHash: receipt.hash,
              status: 'active'
            } : o
          ));
        }
      } else {
        // No real ID found — keep as temp with published status
        setOrders(prev => prev.map(o =>
          o.id === tempId ? { ...o, txHash: receipt.hash, status: 'published' } : o
        ));
      }

      setSellAmount('');
      setBuyAmount('');
      setTimeout(fetchHistory, 3000); // Background sync still runs but is no longer critical

      setSwapStats(prev => ({
        ...prev,
        [sellAsset.symbol]: prev[sellAsset.symbol] + 1
      }));

    } catch (err) {
      console.error("Submission failed:", err);
      alert("Transaction failed: " + (err.reason || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!account || !walletProvider) return;

    let targetOrderId = orderId;
    let orderToCancel = orders.find(o => o.id === orderId);

    try {
      setCancellingOrder(orderId);
      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const chainId = activeNetwork.id.toString();
      const contractAddress = ADDRESSES[chainId]?.WalletSwapCallback || ADDRESSES[chainId]?.WalletSwapMain;
      if (!contractAddress) return;

      const walletSwap = new ethers.Contract(contractAddress, WALLET_SWAP_ABI.abi, signer);

      // --- Order ID Rescue Mechanism for 'temp-' orders ---
      if (orderId.toString().startsWith('temp-')) {
        if (!orderToCancel?.txHash) {
          console.error("Cannot rescue order ID: Temporary order has no transaction hash.");
          alert("This order is still syncing and its transaction hash is not yet available. Please use 'Clear Cache' in settings to force a full re-sync, then try again.");
          setCancellingOrder(null);
          return;
        }

        console.log("Attempting to rescue order ID from txHash:", orderToCancel.txHash);
        const freshProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);

        const procIface = new ethers.Interface(ORDER_PROCESSOR_ABI.abi);
        const mainIface = new ethers.Interface(WALLET_SWAP_ABI.abi);
        const orderCreatedTopic = procIface.getEvent('OrderCreated').topicHash;
        const orderInitiatedTopic = mainIface.getEvent('OrderInitiated').topicHash;

        const extractIdFromReceipt = (r) => {
          for (const log of (r?.logs || [])) {
            const t0 = log.topics?.[0];
            if (t0 === orderCreatedTopic || t0 === orderInitiatedTopic) return log.topics[1];
          }
          return null;
        };

        // 1. Receipt scan: Retry up to 12 times with 1.5s delay for recent txs
        for (let attempt = 0; attempt < 12 && targetOrderId.toString().startsWith('temp-'); attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
          try {
            const r = await freshProvider.getTransactionReceipt(orderToCancel.txHash);
            const found = extractIdFromReceipt(r);
            if (found) {
              targetOrderId = found.toString();
              console.log(`Rescue successful via receipt scan on attempt #${attempt + 1}! orderId:`, targetOrderId);
              // Update state immediately so UI reflects real ID
              setOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, id: targetOrderId, txHash: orderToCancel.txHash } : o
              ));
            } else if (attempt === 0) {
              console.warn("Receipt scan attempt #1: receipt null or no matching log, will retry...");
            }
          } catch (rescueErr) {
            console.warn(`Receipt scan attempt #${attempt + 1} failed:`, rescueErr.message);
          }
        }

        // 2. Event scan fallback: scan OrderCreated/OrderInitiated events for this txHash
        // Tries progressively smaller block ranges in case the RPC rejects wide-range queries
        if (targetOrderId.toString().startsWith('temp-')) {
          console.warn("Receipt scans failed — trying event-scan fallback (ranged)...");
          const processorAddr = ADDRESSES[chainId]?.EulerLagrangeOrderProcessor;
          const processor = new ethers.Contract(processorAddr, ORDER_PROCESSOR_ABI.abi, freshProvider);
          const walletSwapContractForEvents = new ethers.Contract(contractAddress, WALLET_SWAP_ABI.abi, freshProvider);

          // Filters for both OrderCreated (from processor) and OrderInitiated (from walletSwap)
          const processorFilter = processor.filters.OrderCreated(null, ethers.getAddress(account));
          const walletSwapFilter = walletSwapContractForEvents.filters.OrderInitiated(null, ethers.getAddress(account));

          const rangesToTry = [50000, 200000, 1000000]; // Smallest range first

          for (const rangeSize of rangesToTry) {
            if (!targetOrderId.toString().startsWith('temp-')) break; // Stop if ID found
            try {
              const currentBlock = await freshProvider.getBlockNumber();
              const fromBlock = currentBlock > rangeSize ? currentBlock - rangeSize : 0;
              console.log(`Scanning ${rangeSize} blocks (${fromBlock} to latest) for OrderCreated/OrderInitiated...`);

              const processorEvents = await processor.queryFilter(processorFilter, fromBlock, 'latest');
              const walletSwapEvents = await walletSwapContractForEvents.queryFilter(walletSwapFilter, fromBlock, 'latest');

              const allEvents = [...processorEvents, ...walletSwapEvents];

              const matchingEvent = allEvents.find(e =>
                e.transactionHash?.toLowerCase() === orderToCancel.txHash?.toLowerCase()
              );

              if (matchingEvent) {
                targetOrderId = matchingEvent.args.orderId;
                console.log("Event-scan rescue successful! orderId:", targetOrderId);
                setOrders(prev => prev.map(o =>
                  o.id === orderId ? { ...o, id: targetOrderId.toString(), txHash: matchingEvent.transactionHash } : o
                ));
              }
            } catch (scanErr) {
              console.warn("Event scan with range " + rangeSize + " failed:", scanErr.message);
            }
          }
        }
      }

      if (targetOrderId.toString().startsWith('temp-')) {
        console.error("Rescue failed: No OrderCreated/OrderInitiated event found in logs after all retries.");
        alert("Could not find your Order ID on-chain yet. The Sonic RPC may be slightly behind. Please wait ~1 minute then try Cancelling again, or use 'Emergency Reset' (Clear Cache) in Settings.");
        setCancellingOrder(null);
        return;
      }

      console.log("Executing Cancellation for ID:", targetOrderId);

      // Pre-cancel check: verify on-chain status to give better UX
      try {
        const processorAddr = ADDRESSES[chainId]?.EulerLagrangeOrderProcessor;
        const processorContract = new ethers.Contract(processorAddr, ORDER_PROCESSOR_ABI.abi, provider);
        const onChainOrder = await processorContract.getOrder(targetOrderId);
        const statusNames = ['active', 'filled', 'partial', 'cancelled', 'expired'];
        const currentStatus = statusNames[Number(onChainOrder.status)] || 'unknown';

        if (currentStatus === 'filled') {
          alert("This order was already filled! Your swap completed successfully. Check your wallet for the received tokens.");
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'filled', id: targetOrderId.toString() } : o));
          setCancellingOrder(null);
          fetchHistory();
          return;
        }
        if (currentStatus === 'cancelled') {
          alert("This order is already cancelled on-chain.");
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled', id: targetOrderId.toString() } : o));
          setCancellingOrder(null);
          return;
        }
      } catch (checkErr) {
        console.warn("Pre-cancel status check failed, proceeding with cancel:", checkErr);
      }

      const tx = await walletSwap.cancelOrder(targetOrderId);

      // Optimistic update — also remap the orderId if it was resolved via rescue
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled', id: targetOrderId.toString() } : o));

      await tx.wait();
      console.log("Order Cancelled Success!");
      fetchHistory();
    } catch (err) {
      console.error("Cancellation failed:", err);
      alert("Failed to cancel: " + (err.reason || err.message));
    } finally {
      setCancellingOrder(null);
    }
  };

  const handleClearCache = () => {
    if (window.confirm("This will clear your local order history and force a full re-sync from the blockchain. Continue?")) {
      localStorage.removeItem('autoswap_orders');
      setOrders([]);
      // We don't call fetchHistory immediately because setOrders([]) will trigger re-renders
      // and the useEffect will pick it up, or the user can click refresh.
      // But for better UX, let's trigger it.
      setTimeout(() => fetchHistory(), 100);
    }
  };

  const handleInspectOrder = async (orderId) => {
    if (!orderId || orderId.toString().startsWith('temp-')) {
      alert("This order is still syncing with the blockchain. Please wait a few seconds.");
      return;
    }

    try {
      setIsInspecting(true);
      setShowInspectModal(true);

      let effectiveProvider;
      if (walletProvider) {
        effectiveProvider = new ethers.BrowserProvider(walletProvider);
      } else {
        effectiveProvider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
      }

      const chainId = activeNetwork.id.toString();
      const processorAddress = ADDRESSES[chainId]?.EulerLagrangeOrderProcessor;
      const processor = new ethers.Contract(processorAddress, ORDER_PROCESSOR_ABI.abi, effectiveProvider);

      const order = await processor.getOrder(orderId);

      const statusMap = ['ACTIVE', 'FILLED', 'PARTIAL', 'CANCELLED', 'EXPIRED'];

      setInspectedOrder({
        id: orderId,
        maker: order.maker,
        tokenIn: order.tokenIn,
        tokenOut: order.tokenOut,
        amountIn: order.amountIn.toString(),
        amountOut: order.amountOut.toString(),
        filledAmount: order.filledAmount.toString(),
        status: statusMap[Number(order.status)] || 'UNKNOWN',
        rawStatus: order.status.toString(),
        expiration: new Date(Number(order.expiration) * 1000).toLocaleString(),
        isExpired: Number(order.expiration) < Math.floor(Date.now() / 1000)
      });
    } catch (err) {
      console.error("Inspection failed:", err);
      alert("Failed to fetch on-chain data: " + (err.reason || err.message));
      setShowInspectModal(false);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleFetchCustomToken = async () => {
    if (!customTokenAddressInput || !ethers.isAddress(customTokenAddressInput)) {
      alert("Please enter a valid Ethereum address.");
      return;
    }

    // Check if token already exists
    const exists = activeAssets.find(a => a.address.toLowerCase() === customTokenAddressInput.toLowerCase() && BigInt(a.chainId) === BigInt(activeNetwork.id));
    if (exists) {
      alert("Token already exists in the list for this network.");
      return;
    }

    try {
      setIsFetchingCustomToken(true);
      setCustomTokenPreview(null);
      let provider;
      if (walletProvider) {
        provider = new ethers.BrowserProvider(walletProvider);
      } else {
        provider = new ethers.JsonRpcProvider(activeNetwork.rpcUrl);
      }

      const tokenContract = new ethers.Contract(customTokenAddressInput, ERC20_ABI, provider);

      const symbolPromise = tokenContract.symbol().catch(() => 'UNKNOWN');
      const namePromise = tokenContract.name().catch(() => 'Unknown Token');
      const decimalsPromise = tokenContract.decimals().catch(() => 18n);

      const [symbol, name, decimals] = await Promise.all([symbolPromise, namePromise, decimalsPromise]);

      setCustomTokenPreview({
        address: customTokenAddressInput,
        chainId: activeNetwork.id,
        symbol,
        name,
        decimals: Number(decimals),
        logoURI: ''
      });

    } catch (err) {
      console.error("Failed to fetch custom token:", err);
      alert("Failed to load token. Make sure it's a valid ERC20 contract on the active network.");
    } finally {
      setIsFetchingCustomToken(false);
    }
  };

  const handleAddCustomToken = () => {
    if (!customTokenPreview) return;
    const updatedCustomTokens = [...customTokens, customTokenPreview];
    setCustomTokens(updatedCustomTokens);
    localStorage.setItem('autoswap_custom_tokens', JSON.stringify(updatedCustomTokens));
    setCustomTokenPreview(null);
    setCustomTokenAddressInput('');
    setShowAddCustomTokenModal(false);
  };

  const TopNav = () => (
    <header className="flex justify-between items-center px-4 md:px-8 py-4 w-full border-b border-white/5 z-50 sticky top-0" style={{background:'#080C10',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setCurrentView('landing')}>
           <div className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shadow-[0_0_12px_#00E5FF] group-hover:scale-125 transition-transform"></div>
           <span style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.2rem',letterSpacing:'0.08em',color:'#E8EAED'}} className="hidden sm:block">AUTOSWAP</span>
        </div>
        
        <div className="hidden lg:flex items-center gap-6 ml-12" style={{marginLeft:'3rem'}}>
          {['intents', 'marketplace', 'history', 'security', 'info'].map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              style={{
                fontFamily:'DM Mono,monospace',
                fontSize:'0.75rem',
                textTransform:'uppercase',
                letterSpacing:'0.1em',
                color: currentView === view ? '#00E5FF' : '#484F58',
                background:'none',
                border:'none',
                paddingBottom:'4px',
                cursor:'pointer',
                transition:'all 0.2s',
                fontWeight: currentView === view ? 800 : 500
              }}
              className="hover:text-[#00E5FF]/80"
            >
              {view === 'intents' ? 'Trade' : view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-xl cursor-pointer hover:border-[#00E5FF]/30 transition-all"
            style={{border:'1px solid rgba(255,255,255,0.06)',background:'#0D1117'}}
            onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
          >
            <span className="text-lg">{activeNetwork.icon}</span>
            <span className="font-bold text-[0.65rem] uppercase tracking-widest hidden sm:block" style={{fontFamily:'DM Mono,monospace',color:'#8B949E'}}>{activeNetwork.name}</span>
            <ChevronDown size={14} className="text-white/20" style={{transition:'transform 0.2s',transform:showNetworkDropdown?'rotate(180deg)':'none'}} />
          </div>

          <AnimatePresence>
            {showNetworkDropdown && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="dropdown-content mt-3 right-0 shadow-2xl" style={{ right: '0', left: 'auto', border:'1px solid rgba(255,255,255,0.1)' }}>
                <div className="py-2 max-h-64 overflow-y-auto custom-scrollbar" style={{background:'#0D1117'}}>
                  {NETWORKS.map(network => (
                    <div key={network.id} className="dropdown-item py-2.5 px-5 hover:bg-[#00E5FF]/5" onClick={() => switchNetwork(network)}>
                      <span className="text-lg">{network.icon}</span>
                      <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED'}}>{network.name}</span>
                      {activeNetwork.id === network.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]"></div>}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button 
          onClick={connectWallet} 
          style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',background:'#00E5FF',color:'#080C10',boxShadow:'0 0 20px rgba(0,229,255,0.2)'}}
          className="flex items-center gap-2 px-5 py-2 font-bold rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Wallet size={16} />
          <span className="uppercase tracking-widest">{account ? `${account.substring(0, 6)}...` : 'Authorize'}</span>
        </button>
        
        <button className="p-2.5 text-white/40 hover:text-[#00E5FF] hover:bg-white/5 rounded-xl transition-colors hidden sm:flex border border-white/5" onClick={() => setCurrentView('settings')}>
          <Settings size={18} />
        </button>
        
        <button className="p-2 text-white/60 hover:text-[#00E5FF] lg:hidden" onClick={() => setShowMobileSidebar(!showMobileSidebar)}>
          <Menu size={24} />
        </button>
      </div>
    </header>
  );

  return (
    <div className={`flex flex-col min-h-screen relative`} style={{background:'#080C10'}}>
      <TopNav />
      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-8 backdrop-blur-xl" style={{background:'rgba(8,12,16,0.95)'}}
          >
            <div className="flex flex-col gap-10 items-center w-full">
              <div className="flex items-center gap-3 mb-12">
                 <div className="w-3 h-3 rounded-full bg-[#00E5FF] shadow-[0_0_15px_#00E5FF]"></div>
                 <span style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'2rem',letterSpacing:'0.1em',color:'#E8EAED'}}>AUTOSWAP</span>
              </div>

              {['intents', 'marketplace', 'history', 'security', 'info', 'settings'].map((view) => (
                <button
                  key={view}
                  onClick={() => { setCurrentView(view); setShowMobileSidebar(false); }}
                  style={{
                    fontFamily:'Syne,sans-serif',
                    fontSize:'1.75rem',
                    fontWeight:800,
                    color: currentView === view ? '#00E5FF' : '#484F58',
                    background:'none',
                    border:'none',
                    cursor:'pointer',
                    letterSpacing:'-0.02em',
                    transition:'all 0.3s'
                  }}
                  className="hover:scale-110 active:scale-95"
                >
                  {view === 'intents' ? 'Exchange' : view.charAt(0).toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowMobileSidebar(false)} 
              className="absolute top-10 right-10 p-4 rounded-full border border-white/5 bg-white/5 text-white/40 hover:text-[#00E5FF] transition-all"
            >
              <X size={32} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col items-center w-full p-4 md:p-8 overflow-y-auto pb-32 relative">
        <div className="absolute inset-0 pointer-events-none z-0" style={{background:'radial-gradient(ellipse at center, rgba(0,229,255,0.04) 0%, transparent 70%)'}}></div>

        <AnimatePresence mode="wait">
          {currentView === 'landing' && (
            <motion.div
              key="landing" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
              className="flex flex-col items-center justify-center w-full mx-auto mt-12 md:mt-20 text-center z-10 px-4"
            >
              <div className="mb-6 px-4 py-1 rounded-full bg-[#00E5FF]/5 border border-[#00E5FF]/20">
                <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#00E5FF',fontWeight:800}} className="uppercase tracking-[0.3em]">Reactive Network Protocol v1.4</span>
              </div>

              <h1 className="text-5xl md:text-8xl font-bold text-white mb-8 tracking-tighter leading-none" style={{fontFamily:'Syne,sans-serif'}}>
                SWAP <span style={{color:'#00E5FF'}}>ANYTHING.</span><br/>OWN EVERYTHING.
              </h1>
              
              <p className="text-lg text-[#8B949E] mb-12 max-w-2xl mx-auto leading-relaxed" style={{fontFamily:'DM Mono,monospace',fontSize:'0.9rem'}}>
                Declare your intent. specialized solvers resolve liquidity atomically across any EVM chain. Zero slippage. Zero pools. Full custody.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-6 mb-24">
                <button 
                  onClick={() => setCurrentView('intents')}
                  style={{padding:'20px 48px',fontFamily:'DM Mono,monospace',fontSize:'0.8rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.15em',background:'#00E5FF',color:'#080C10',borderRadius:'12px',cursor:'pointer',transition:'all 0.3s',boxShadow:'0 0 40px rgba(0,229,255,0.3)'}}
                  className="hover:scale-105 active:scale-95"
                >
                  Authorize Exchange
                </button>
                <button 
                  style={{padding:'20px 48px',fontFamily:'DM Mono,monospace',fontSize:'0.8rem',fontWeight:800,textTransform:'uppercase',letterSpacing:'0.15em',background:'transparent',color:'#00E5FF',borderRadius:'12px',border:'1px solid rgba(0,229,255,0.2)',cursor:'pointer',transition:'all 0.3s'}}
                  className="hover:bg-[#00E5FF]/5"
                >
                  Technical Specs
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left w-full max-w-6xl mx-auto">
                {[
                  { icon: Lock, title: 'Non-Custodial', desc: 'Assets remain in your secure perimeter until the exact matching condition is verified on-chain.' },
                  { icon: Zap, title: 'Solidity Logic', desc: 'Atomic execution layer powered by R-EVM event-driven triggers. No bridge required.' },
                  { icon: Layers, title: 'Multi-Chain', desc: 'Seamlessly transition liquidity across Sonic, Sepolia, and Lasna without trust assumptions.' }
                ].map((item, idx) => (
                  <div key={idx} className="p-10 rounded-[2rem] border border-white/5 transition-all group relative overflow-hidden" style={{background:'#0D1117'}}>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#00E5FF]/5 rounded-full -mr-16 -mt-16 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <item.icon size={32} style={{color:'#00E5FF',marginBottom:'24px'}} />
                    <h3 className="text-xl font-bold text-white mb-4" style={{fontFamily:'Syne,sans-serif',letterSpacing:'-0.02em'}}>{item.title}</h3>
                    <p style={{color:'#484F58',fontFamily:'DM Mono,monospace',fontSize:'0.75rem',lineHeight:'1.8'}}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {currentView === 'intents' && (
            <motion.div
              key="intents" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.15 }}
              className="swap-layout mt-4 md:mt-16 lg:mt-24 w-full z-10"
            >
              {/* Left Flanking Panel — Escrow Status */}
              <div className="flanking-panel">
                <div className="panel-card">
                  <div className="panel-label">Custody Status</div>
                  <div className="custody-row">
                    <div className="custody-type" style={{color:'#00E5FF'}}>Native Token (AVAX/ETH/S/FLR)</div>
                    <div className="custody-detail">▶ Held in escrow until:<br/>• Match confirmed, OR<br/>• Order cancelled, OR<br/>• Expiry reached<br/><span style={{color:'#3FB950'}}>✓ Returnable anytime before match</span></div>
                  </div>
                  <div className="custody-row">
                    <div className="custody-type">ERC-20 Tokens</div>
                    <div className="custody-detail">▶ Non-custodial<br/>Your wallet retains control<br/>Contract executes on match only</div>
                  </div>
                  <div className="custody-row">
                    <div className="custody-type">NFTs (ERC-721 / ERC-1155)</div>
                    <div className="custody-detail">▶ Non-custodial<br/>Approval granted, not deposited<br/>Transfer only on atomic match</div>
                  </div>
                </div>
              </div>

              {/* Center — Swap Card */}
              <div style={{width:'100%',maxWidth:'480px',flexShrink:0}}>
              <div className="w-full glass-card p-2 relative" style={{ zIndex: 20, boxShadow: '0 0 40px rgba(0,0,0,0.6)', background:'#0D1117', border:'1px solid rgba(255,255,255,0.06)', minHeight: activeOrderTracking ? '500px' : 'auto', display: 'flex', flexDirection: 'column' }}>
                {activeOrderTracking ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="relative mb-12">
                      <div className="absolute inset-0 rounded-full animate-ping bg-[#00E5FF]/20" style={{ margin: '-20px' }}></div>
                      <div className="w-24 h-24 rounded-full border-2 border-[#00E5FF] flex items-center justify-center bg-[#080C10] relative z-10 shadow-[0_0_30px_rgba(0,229,255,0.3)]">
                        <Activity size={40} style={{color:'#00E5FF'}} />
                      </div>
                    </div>
                    
                    <h2 style={{fontFamily:'Syne,sans-serif',fontSize:'1.5rem',fontWeight:800,color:'#E8EAED',marginBottom:'0.5rem'}}>
                      {(() => {
                        const order = orders.find(o => o.id === activeOrderTracking);
                        if (!order || order.status === 'creating' || order.status === 'published') return 'Syncing with Reactive...';
                        if (order.status === 'active') return 'Price Matching...';
                        if (order.status === 'filled') return 'Intent Resolved';
                        return 'Processing Order...';
                      })()}
                    </h2>
                    
                    <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.8rem',color:'#8B949E',marginBottom:'2.5rem',maxWidth:'280px'}}>
                      {(() => {
                        const order = orders.find(o => o.id === activeOrderTracking);
                        if (!order || order.status === 'creating') return 'Transaction confirmed. Indexing on Reactive Network...';
                        if (order.status === 'active') return 'Your intent is live. Seeking counter-party liquidity...';
                        if (order.status === 'filled') return 'Swap executed atomically. Assets delivered to wallet.';
                        return 'Waiting for network confirmation...';
                      })()}
                    </p>

                    <div className="w-full space-y-4 mb-8">
                       {[
                         { label: 'Intent Created', status: 'done' },
                         { label: 'Network Validation', status: (orders.find(o => o.id === activeOrderTracking)?.status !== 'creating') ? 'done' : 'pending' },
                         { label: 'Solidity Matching', status: (orders.find(o => o.id === activeOrderTracking)?.status === 'filled') ? 'done' : (orders.find(o => o.id === activeOrderTracking)?.status === 'active' ? 'active' : 'pending') },
                         { label: 'Asset Settlement', status: (orders.find(o => o.id === activeOrderTracking)?.status === 'filled') ? 'done' : 'pending' }
                       ].map((step, idx) => (
                         <div key={idx} className="flex items-center gap-3">
                           <div className={`w-2 h-2 rounded-full ${step.status === 'done' ? 'bg-[#3FB950]' : (step.status === 'active' ? 'bg-[#00E5FF] animate-pulse' : 'bg-white/10')}`}></div>
                           <span style={{fontFamily:'DM Mono,monospace', fontSize:'0.7rem', color: step.status === 'done' ? '#E8EAED' : '#484F58', textTransform:'uppercase'}}>{step.label}</span>
                           {step.status === 'done' && <CheckCircle2 size={12} style={{color:'#3FB950'}} className="ml-auto" />}
                         </div>
                       ))}
                    </div>

                    <div className="flex flex-col w-full gap-3">
                      <button 
                        onClick={() => setActiveOrderTracking(null)}
                        className="w-full py-3 text-xs font-bold rounded-xl transition-all uppercase tracking-widest"
                        style={{ background:'#00E5FF', color:'#080C10', fontFamily:'DM Mono,monospace' }}
                      >
                        Start Another Swap
                      </button>
                      
                      <a 
                        href={`${activeNetwork.explorer}/tx/${orders.find(o => o.id === activeOrderTracking)?.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[0.65rem] font-bold py-2 hover:text-white transition-colors flex items-center justify-center gap-1 uppercase tracking-wider"
                        style={{ color:'#484F58', fontFamily:'DM Mono,monospace' }}
                      >
                        View Transaction <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <>
                {/* Swap Header */}
                <div className="flex justify-between items-center mb-2 px-4 py-3">
                  <div className="flex gap-6 items-center">
                    <span style={{color:'#E8EAED',fontFamily:'DM Mono,monospace',fontWeight:700,fontSize:'0.85rem',borderBottom:'2px solid #00E5FF',paddingBottom:'4px',cursor:'pointer'}}>Swap</span>
                    <span style={{color:'#484F58',fontFamily:'DM Mono,monospace',fontWeight:700,fontSize:'0.85rem',cursor:'pointer'}} onClick={() => setCurrentView('history')}>Limit</span>
                    <span style={{color:'#484F58',fontFamily:'DM Mono,monospace',fontWeight:700,fontSize:'0.85rem',cursor:'pointer'}}>TWAP</span>
                  </div>
                  <div className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{color:'#8B949E'}} onClick={() => setCurrentView('settings')}>
                    <span style={{fontSize:'0.7rem',padding:'2px 8px',borderRadius:'9999px',border:'1px solid rgba(255,255,255,0.1)',background:'#080C10',fontFamily:'DM Mono,monospace'}}>Auto</span>
                    <Settings size={16} />
                  </div>
                </div>

                <div className="input-container mb-1 rounded-3xl py-6 px-4 group hover:border-white/20 transition-all focus-within:border-indigo-500/50" style={{background:'#080C10', border:'1px solid rgba(255,255,255,0.06)'}}>
                  <div className="flex justify-between text-xs text-white/40 mb-3" style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                    <span>{sellAsset.decimals === 0 ? "You Send (ID)" : "You Send"}</span>
                    <span>{sellAsset.decimals === 0 ? "Owned: " : "Balance: "}{tokenBalances[`${sellAsset.chainId}-${sellAsset.address.toLowerCase()}`] ? (sellAsset.decimals === 0 ? parseInt(tokenBalances[`${sellAsset.chainId}-${sellAsset.address.toLowerCase()}`]) : parseFloat(tokenBalances[`${sellAsset.chainId}-${sellAsset.address.toLowerCase()}`]).toFixed(4)) : "0"} {sellAsset.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center relative" ref={sellDropdownRef}>
                    <div
                      className="flex items-center gap-2 p-2 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10"
                      onClick={() => setShowSellDropdown(!showSellDropdown)}
                      style={{border:'1px solid rgba(255,255,255,0.04)'}}
                    >
                      {sellAsset.logoURI ? (
                        <img src={sellAsset.logoURI} alt={sellAsset.symbol} className="w-5 h-5 rounded-full token-icon" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">{sellAsset.symbol[0]}</div>
                      )}
                      <span className="font-bold text-sm" style={{fontFamily:'DM Mono,monospace'}}>{sellAsset.symbol}</span>
                      <ChevronDown size={14} className="text-white/40" />
                    </div>

                    <AnimatePresence>
                      {showSellDropdown && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="dropdown-content left-0 top-full mt-2" style={{ right: 'auto', minWidth: '240px', zIndex: 50, background:'#111820' }}>
                          <div className="sticky top-0 z-10 px-2 pb-2 pt-1 border-b border-white/5" style={{background:'#111820'}}>
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                              <input
                                type="text"
                                placeholder="Search tokens..."
                                value={sellSearch}
                                onChange={(e) => setSellSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-indigo-500/50"
                                style={{fontFamily:'DM Mono,monospace'}}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="py-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {(() => {
                              if (filteredSellAssets.length === 0) {
                                return (
                                  <div className="p-4 flex flex-col items-center justify-center text-xs text-white/40">
                                    <span className="mb-2">No tokens found</span>
                                    <button onClick={() => { setShowSellDropdown(false); setShowAddCustomTokenModal(true); }} className="px-3 py-1.5 rounded-lg font-medium transition-colors" style={{background:'rgba(0,229,255,0.1)',color:'#00E5FF'}}>
                                      + Add Custom Token
                                    </button>
                                  </div>
                                );
                              }
                              return filteredSellAssets.map(asset => {
                                const balKey = `${asset.chainId}-${asset.address.toLowerCase()}`;
                                const bal = parseFloat(tokenBalances[balKey] || '0');
                                const hasBal = bal > 0;
                                const network = NETWORKS.find(n => BigInt(n.id) === BigInt(asset.chainId)) || { name: 'Unknown', color: '#888' };
                                return (
                                  <div
                                    key={`${asset.chainId}-${asset.address}`}
                                    className={`dropdown-item ${hasBal ? '' : 'opacity-40 hover:opacity-100'}`}
                                    onClick={() => { setSellAsset(asset); setShowSellDropdown(false); setSellSearch(''); }}
                                  >
                                    {asset.logoURI ? (
                                      <img src={asset.logoURI} alt={asset.symbol} className="w-5 h-5 rounded-full token-icon" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">{asset.symbol[0]}</div>
                                    )}
                                    <div className="flex flex-col items-start ml-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm font-bold" style={{fontFamily:'DM Mono,monospace'}}>{asset.symbol}</span>
                                        <span className="text-[8px] px-1 py-0.5 rounded-sm bg-black/20" style={{ color: network.color }}>{network.name}</span>
                                      </div>
                                      <span className="text-[10px] text-white/40">{asset.name}</span>
                                    </div>
                                    <span className="text-sm font-medium ml-auto" style={{fontFamily:'DM Mono,monospace'}}>{bal > 0 ? bal.toFixed(4) : "0.00"}</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          {filteredSellAssets.length > 0 && (
                            <div className="p-2 border-t border-white/5" style={{background:'#111820'}}>
                              <button onClick={() => { setShowSellDropdown(false); setShowAddCustomTokenModal(true); }} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors" style={{color:'#00E5FF'}}>
                                + Add Custom Token
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <input 
                      type={sellAsset.decimals === 0 ? "number" : "number"} 
                      step={sellAsset.decimals === 0 ? "1" : "any"}
                      min={sellAsset.decimals === 0 ? "1" : "0"}
                      placeholder={sellAsset.decimals === 0 ? "ID" : "0.0"} 
                      value={sellAmount} 
                      onChange={(e) => setSellAmount(e.target.value)} 
                      className="text-right text-4xl font-bold w-[60%] bg-transparent outline-none placeholder-white/20 text-white"
                      style={{fontFamily:'Syne,sans-serif'}}
                    />
                  </div>
                </div>

                <div className="flex justify-center -my-5 relative z-10 pointer-events-none">
                  <button onClick={(e) => {
                    e.preventDefault();
                    const t = sellAsset; setSellAsset(buyAsset); setBuyAsset(t);
                    const v = sellAmount; setSellAmount(buyAmount); setBuyAmount(v);
                  }} className="p-2 rounded-xl text-white/60 hover:text-white transition-colors shadow-lg cursor-pointer pointer-events-auto group" style={{background:'#0D1117', border:'4px solid #080C10'}}>
                    <ArrowDownUp size={18} className="group-hover:rotate-180 transition-transform duration-300" style={{color:'#00E5FF'}} />
                  </button>
                </div>

                <div className="input-container mb-2 mt-1 rounded-3xl py-6 px-4 group hover:border-white/20 transition-all focus-within:border-indigo-500/50" style={{background:'#080C10', border:'1px solid rgba(255,255,255,0.06)'}}>
                  <div className="flex justify-between text-xs text-white/40 mb-3" style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                    <div className="flex items-center gap-2">
                       <span>{buyAsset.decimals === 0 ? "You Receive (ID)" : "You Receive"}</span>
                       <div className="relative">
                         <div 
                           className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 cursor-pointer hover:bg-white/10 text-[10px] font-bold border border-white/5"
                           onClick={() => setShowTargetNetworkDropdown(!showTargetNetworkDropdown)}
                         >
                           <span>{targetNetwork.icon}</span>
                           <span>{targetNetwork.name}</span>
                           <ChevronDown size={10} />
                         </div>
                         <AnimatePresence>
                           {showTargetNetworkDropdown && (
                             <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="dropdown-content left-0 top-full mt-1 border border-white/10" style={{ zIndex: 100, minWidth: '160px', background:'#111820' }}>
                               {NETWORKS.map(network => (
                                 <div 
                                   key={network.id} className="dropdown-item py-1.5 px-3"
                                   onClick={() => { setTargetNetwork(network); setShowTargetNetworkDropdown(false); }}
                                 >
                                   <span className="text-sm">{network.icon}</span>
                                   <span className="text-[11px] font-medium">{network.name}</span>
                                   {targetNetwork.id === network.id && <CheckCircle2 size={12} className="ml-auto" style={{color:'#00E5FF'}} />}
                                 </div>
                               ))}
                             </motion.div>
                           )}
                         </AnimatePresence>
                       </div>
                    </div>
                    <span>{buyAsset.decimals === 0 ? "Owned: " : "Balance: "}{tokenBalances[`${buyAsset.chainId}-${buyAsset.address.toLowerCase()}`] ? (buyAsset.decimals === 0 ? parseInt(tokenBalances[`${buyAsset.chainId}-${buyAsset.address.toLowerCase()}`]) : parseFloat(tokenBalances[`${buyAsset.chainId}-${buyAsset.address.toLowerCase()}`]).toFixed(4)) : "0"} {buyAsset.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center relative" ref={buyDropdownRef}>
                    <div
                      className="flex items-center gap-2 p-2 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10"
                      onClick={() => setShowBuyDropdown(!showBuyDropdown)}
                      style={{border:'1px solid rgba(255,255,255,0.04)'}}
                    >
                      {buyAsset.logoURI ? (
                        <img src={buyAsset.logoURI} alt={buyAsset.symbol} className="w-5 h-5 rounded-full token-icon" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">{buyAsset.symbol[0]}</div>
                      )}
                      <span className="font-bold text-sm" style={{fontFamily:'DM Mono,monospace'}}>{buyAsset.symbol}</span>
                      <ChevronDown size={14} className="text-white/40" />
                    </div>

                    <AnimatePresence>
                      {showBuyDropdown && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="dropdown-content left-0 top-full mt-2" style={{ right: 'auto', minWidth: '240px', zIndex: 50, background:'#111820' }}>
                          <div className="sticky top-0 z-10 px-2 pb-2 pt-1 border-b border-white/5" style={{background:'#111820'}}>
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                              <input
                                type="text"
                                placeholder="Search tokens..."
                                value={buySearch}
                                onChange={(e) => setBuySearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-indigo-500/50"
                                style={{fontFamily:'DM Mono,monospace'}}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="py-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {filteredBuyAssets.length === 0 ? (
                              <div className="p-4 flex flex-col items-center justify-center text-xs text-white/40">
                                <span className="mb-2">No tokens found</span>
                                <button onClick={() => { setShowBuyDropdown(false); setShowAddCustomTokenModal(true); }} className="px-3 py-1.5 rounded-lg font-medium transition-colors" style={{background:'rgba(0,229,255,0.1)',color:'#00E5FF'}}>
                                  + Add Custom Token
                                </button>
                              </div>
                            ) : (
                              filteredBuyAssets.map(asset => {
                                const network = NETWORKS.find(n => BigInt(n.id) === BigInt(asset.chainId)) || { name: 'Unknown', color: '#888' };
                                return (
                                  <div
                                    key={`${asset.chainId}-${asset.address}`} className="dropdown-item"
                                    onClick={() => { setBuyAsset(asset); setShowBuyDropdown(false); setBuySearch(''); }}
                                  >
                                    {asset.logoURI ? (
                                      <img src={asset.logoURI} alt={asset.symbol} className="w-5 h-5 rounded-full token-icon" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">{asset.symbol[0]}</div>
                                    )}
                                    <div className="flex flex-col items-start ml-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm font-bold" style={{fontFamily:'DM Mono,monospace'}}>{asset.symbol}</span>
                                        <span className="text-[8px] px-1 py-0.5 rounded-sm bg-black/20" style={{ color: network.color }}>{network.name}</span>
                                      </div>
                                      <span className="text-[10px] text-white/40">{asset.name}</span>
                                    </div>
                                    {(() => {
                                      const balKey = `${asset.chainId}-${asset.address.toLowerCase()}`;
                                      const balStr = tokenBalances[balKey];
                                      return (
                                        <span className="text-sm font-medium ml-auto text-white/40" style={{fontFamily:'DM Mono,monospace'}}>{balStr && parseFloat(balStr) > 0 ? parseFloat(balStr).toFixed(4) : "0.00"}</span>
                                      );
                                    })()}
                                  </div>
                                )
                              })
                            )}
                          </div>
                          {filteredBuyAssets.length > 0 && (
                            <div className="p-2 border-t border-white/5" style={{background:'#111820'}}>
                              <button onClick={() => { setShowBuyDropdown(false); setShowAddCustomTokenModal(true); }} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-medium transition-colors" style={{color:'#00E5FF'}}>
                                + Add Custom Token
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <input 
                      type={buyAsset.decimals === 0 ? "number" : "number"} 
                      step={buyAsset.decimals === 0 ? "1" : "any"}
                      min={buyAsset.decimals === 0 ? "1" : "0"}
                      placeholder={buyAsset.decimals === 0 ? "ID" : "0.0"} 
                      value={buyAmount} 
                      onChange={(e) => setBuyAmount(e.target.value)} 
                      className="text-right text-4xl font-bold w-[60%] bg-transparent outline-none placeholder-white/20 text-white" 
                      style={{fontFamily:'Syne,sans-serif'}}
                    />
                  </div>
                </div>

                {effectiveRate && sellAsset.decimals !== 0 && buyAsset.decimals !== 0 && (
                  <div className="mb-2 px-2 flex justify-between items-center text-[10px] font-mono">
                    <span className="text-white/40">Market Rate</span>
                    <span style={{color:'#00E5FF'}}>1 {sellAsset.symbol} = {effectiveRate} {buyAsset.symbol}</span>
                  </div>
                )}

                {activeNetwork.id !== targetNetwork.id && (
                  <div className="mb-6 px-2 flex justify-between items-center text-[10px] font-mono">
                    <div className="flex items-center gap-1 text-white/40">
                      <Zap size={10} style={{color:'#00E5FF'}} />
                      <span>Reactive Network Fee</span>
                    </div>
                    <span style={{color:'#00E5FF'}}>0.002 {activeNetwork.currency}</span>
                  </div>
                )}

                <button onClick={handleSubmitIntent} disabled={isSubmitting || !sellAmount || !buyAmount} className="w-full py-4 text-xs font-bold rounded-2xl transition-all border border-transparent uppercase tracking-widest" style={{ background: (isSubmitting || !sellAmount || !buyAmount) ? 'rgba(255,255,255,0.05)' : '#00E5FF', color: (isSubmitting || !sellAmount || !buyAmount) ? 'rgba(255,255,255,0.2)' : '#080C10', fontFamily:'DM Mono,monospace', boxShadow: (isSubmitting || !sellAmount || !buyAmount) ? 'none' : '0 0 30px rgba(0,229,255,0.2)' }}>
                  {isSubmitting ? 'Syncing with Reactive...' : 'Confirm Intent'}
                </button>
                </>
                )}
              </div>
              </div>

              {/* Info Strip */}
              <div className="info-strip">
                <div className="chip">
                  <Shield size={12} className="chip-icon" style={{color:'#00E5FF'}} />
                  <span>Zero Slippage</span>
                </div>
                <div className="chip">
                  <Zap size={12} className="chip-icon" style={{color:'#00E5FF'}} />
                  <span>Atomic Match</span>
                </div>
                <div className="chip">
                  <Clock size={12} className="chip-icon" style={{color:'#00E5FF'}} />
                  <span>Cancel Anytime</span>
                </div>
              </div>
              
              {/* Right Flanking Panel — Order Context */}
              <div className="flanking-panel">
                <div className="panel-card">
                  <div className="panel-label">Live Order Context</div>
                  <div style={{fontSize:'0.75rem',color:'#E8EAED',fontFamily:'DM Mono,monospace',marginBottom:'1rem'}}>Active Counter-Intents</div>
                  
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-[#080C10] border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                        <span style={{color:'#00E5FF',fontSize:'0.65rem'}}>STABLECOIN MATCH</span>
                        <span style={{color:'#484F58',fontSize:'0.6rem'}}>2m ago</span>
                      </div>
                      <div style={{fontSize:'0.75rem'}}>500 USDC ↔ 499.8 USDT</div>
                    </div>
                    
                    <div className="p-3 rounded-lg bg-[#080C10] border border-white/5 opacity-60">
                      <div className="flex justify-between items-center mb-1">
                        <span style={{color:'#FB923C',fontSize:'0.65rem'}}>NFT ↔ TOKEN</span>
                        <span style={{color:'#484F58',fontSize:'0.6rem'}}>14m ago</span>
                      </div>
                      <div style={{fontSize:'0.75rem'}}>MRED #104 ↔ 2200 S</div>
                    </div>
                  </div>

                  <div className="panel-label mt-8">Network Status</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[0.7rem]">
                      <span>Sonic Mainnet</span>
                      <div className="flex items-center gap-1">
                        <div className="status-dot live"></div>
                        <span style={{color:'#3FB950'}}>Live</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[0.7rem]">
                      <span>Flare Network</span>
                      <div className="flex items-center gap-1">
                        <div className="status-dot live"></div>
                        <span style={{color:'#3FB950'}}>Live</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[0.7rem]">
                      <span>Songbird</span>
                      <div className="flex items-center gap-1">
                        <div className="status-dot soon"></div>
                        <span style={{color:'#484F58'}}>Coming Soon</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto w-full z-10 px-4">
              <div className="flex justify-between items-center mb-10">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search technical intents..." 
                    style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',background:'#0D1117',border:'1px solid rgba(255,255,255,0.06)'}}
                    className="w-full rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-[#00E5FF]/50 transition-all uppercase tracking-wider" 
                  />
                </div>
                <button
                  onClick={() => fetchHistory()}
                  style={{background:'#0D1117',border:'1px solid rgba(255,255,255,1.06)'}}
                  className={`p-3 rounded-xl transition-all text-white/40 hover:text-[#00E5FF] ${isSyncingHistory ? 'animate-spin-slow text-[#00E5FF]' : ''}`}
                  title="Force Sync State"
                >
                  <RefreshCcw size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {orders.filter(o => {
                  try {
                    return !account || ethers.getAddress((o.maker || '')) === ethers.getAddress(account);
                  } catch (e) { return false; }
                }).length === 0 ? (
                  <div className="p-20 text-center rounded-3xl border border-dashed border-white/5 bg-[#0D1117]/30">
                    <HistoryIcon size={48} className="mx-auto mb-6 text-white/10" />
                    <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.8rem',color:'#484F58',textTransform:'uppercase',letterSpacing:'0.1em'}}>Zero active intents detected.</p>
                  </div>
                ) : (
                  orders
                    .filter(o => {
                      try {
                        return !account || ethers.getAddress((o.maker || '')) === ethers.getAddress(account);
                      } catch (e) { return false; }
                    })
                    .map(order => {
                      const isUnknownSell = order.sellAsset.symbol === '???';
                      const isUnknownBuy = order.buyAsset.symbol === '???';
                      const isTemp = order.id.toString().startsWith('temp-');
                      const currentTime = Math.floor(Date.now() / 1000);
                      const isExpired = order.expiration && Number(order.expiration) < currentTime;
                      
                      let statusDisplay = (order.status || '').toString().toLowerCase();
                      if (statusDisplay === 'active' && isExpired) {
                        statusDisplay = 'expired';
                      }

                      const cancellableStatuses = ['published', 'pending', 'active', 'partial', 'matched', 'expired'];
                      const isCorrectNetwork = order.network && BigInt(order.network.id) === BigInt(activeNetwork.id);
                      const canCancel = isCorrectNetwork && (
                        (cancellableStatuses.includes(statusDisplay) && !isTemp) ||
                        (statusDisplay === 'published' && isTemp && order.txHash)
                      );

                      return (
                        <div key={order.id} className="p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between transition-all hover:border-[#00E5FF]/20 group relative overflow-hidden" 
                             style={{background:'#0D1117', border:'1px solid rgba(255,255,255,0.06)'}}>
                          
                          <div className="absolute top-0 left-0 w-1 h-full" style={{background: statusDisplay === 'filled' ? '#3FB950' : (statusDisplay === 'cancelled' ? '#F85149' : '#00E5FF')}}></div>

                          <div className="flex items-center gap-5 w-full md:w-auto">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center relative overflow-hidden" style={{background:'#080C10', border:'1px solid rgba(255,255,255,0.04)'}}>
                               <div className="absolute inset-0 opacity-10" style={{background: statusDisplay === 'filled' ? '#3FB950' : (statusDisplay === 'cancelled' ? '#F85149' : '#00E5FF')}}></div>
                               {statusDisplay === 'filled' ? <CheckCircle2 size={24} style={{color:'#3FB950'}} /> : 
                                (statusDisplay === 'cancelled' ? <X size={24} style={{color:'#F85149'}} /> : <Activity size={24} style={{color:'#00E5FF'}} className={isTemp?'animate-pulse':''} />)}
                            </div>
                            
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1rem',color:'#E8EAED',letterSpacing:'0.02em'}} className="flex items-center gap-2">
                                  {order.sellAmount} {isUnknownSell ? 'TOKEN' : order.sellAsset.symbol} 
                                  <ArrowRight size={14} className="text-white/20" />
                                  {order.buyAmount} {isUnknownBuy ? 'TOKEN' : order.buyAsset.symbol}
                                </h3>
                                {activeNetwork.id !== order.targetNetwork?.id && (
                                  <span style={{fontSize:'0.6rem',padding:'2px 8px',borderRadius:'4px',background:'rgba(251,146,60,0.1)',color:'#FB923C',border:'1px solid rgba(251,146,60,0.2)',fontFamily:'DM Mono,monospace'}} className="font-bold uppercase tracking-widest">Cross-Chain</span>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-4 text-[0.65rem] font-mono" style={{color:'#484F58'}}>
                                <span className="flex items-center gap-1"><Target size={10} /> ID: {isTemp ? 'SYNCING' : order.id.toString().substring(0, 10)}</span>
                                <span className="flex items-center gap-1"><Clock size={10} /> {order.timestamp}</span>
                                <span style={{color: statusDisplay === 'filled' ? '#3FB950' : (statusDisplay === 'cancelled' ? '#F85149' : '#00E5FF')}} className="font-bold uppercase tracking-widest">
                                  {isTemp ? 'Indexing...' : statusDisplay}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-4 w-full md:w-auto mt-4 md:mt-0">
                            {/* Progress Bar for Active/Partial */}
                            {(statusDisplay === 'active' || statusDisplay === 'partial' || statusDisplay === 'filled') && (
                              <div className="w-full md:w-48">
                                <div className="flex justify-between text-[0.6rem] mb-1.5 uppercase tracking-widest font-mono" style={{color:'#484F58'}}>
                                  <span>Execution Progress</span>
                                  <span style={{color:'#00E5FF'}}>{(() => {
                                    const fill = order.rawAmountOut && BigInt(order.rawAmountOut) > 0n
                                      ? Number((BigInt(order.rawFilledAmount) * 100n) / BigInt(order.rawAmountOut))
                                      : 0;
                                    return fill;
                                  })()}%</span>
                                </div>
                                <div className="h-1 w-full rounded-full overflow-hidden" style={{background:'#080C10'}}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{
                                      width: `${order.rawAmountOut && BigInt(order.rawAmountOut) > 0n
                                        ? Number((BigInt(order.rawFilledAmount) * 100n) / BigInt(order.rawAmountOut))
                                        : 0}%`
                                    }}
                                    transition={{ duration: 1, ease: "easeOut" }}
                                    style={{background:'#00E5FF',boxShadow:'0 0 10px rgba(0,229,255,0.4)'}}
                                    className="h-full"
                                  />
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleInspectOrder(order.id); }}
                                style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',background:'#080C10',color:'#8B949E',border:'1px solid rgba(255,255,255,0.06)'}}
                                className="px-4 py-2 rounded-lg font-bold hover:text-white hover:border-white/20 transition-all uppercase tracking-widest"
                              >
                                Detail
                              </button>
                              {canCancel && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                                  disabled={cancellingOrder === order.id}
                                  style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',background:'rgba(248,81,73,0.1)',color:'#F85149',border:'1px solid rgba(248,81,73,0.2)'}}
                                  className="px-4 py-2 rounded-lg font-bold hover:bg-[#F85149] hover:text-white transition-all disabled:opacity-50 flex items-center gap-1 uppercase tracking-widest"
                                >
                                  {cancellingOrder === order.id ? (
                                    <>
                                      <RefreshCcw size={10} className="animate-spin" />
                                      {isTemp ? 'Rescuing' : 'Removing'}
                                    </>
                                  ) : (statusDisplay === 'expired' ? 'Refund' : 'Cancel')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </motion.div>
          )}

          {currentView === 'security' && (
            <motion.div key="security" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6 z-10 px-4">
              <div className="p-8 rounded-3xl border-l-[3px] border-[#00E5FF] shadow-2xl relative overflow-hidden" style={{background:'#0D1117', borderRight:'1px solid rgba(255,255,255,0.06)', borderTop:'1px solid rgba(255,255,255,0.06)', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]"></div>
                <Lock size={32} style={{color:'#00E5FF'}} className="mb-6" />
                <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.25rem',marginBottom:'0.75rem',color:'#E8EAED'}}>Multi-Chain Audit</h3>
                <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#8B949E',lineHeight:'1.6',marginBottom:'1.5rem'}}>AutoSwap Protocol smart contracts have been rigorously audited by leading security firms on Reactive Network and Sonic.</p>
                <button onClick={() => setShowAuditModal(true)} style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#00E5FF'}} className="font-bold flex items-center gap-2 hover:bg-[#00E5FF]/10 transition-colors py-2 px-3 rounded-lg border border-[#00E5FF]/20 uppercase tracking-widest">
                  ACCESS AUDIT LOGS <ExternalLink size={12} />
                </button>
              </div>
              
              <div className="p-8 rounded-3xl border-l-[3px] border-[#3FB950] shadow-2xl relative overflow-hidden" style={{background:'#0D1117', borderRight:'1px solid rgba(255,255,255,0.06)', borderTop:'1px solid rgba(255,255,255,0.06)', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-[#3FB950] shadow-[0_0_8px_#3FB950]"></div>
                <Shield size={32} style={{color:'#3FB950'}} className="mb-6" />
                <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.25rem',marginBottom:'0.75rem',color:'#E8EAED'}}>MEV Protection</h3>
                <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#8B949E',lineHeight:'1.6',marginBottom:'1.5rem'}}>Your trades are protected from front-running and sandwich attacks via our decentralized order matching logic.</p>
                <div style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#3FB950',background:'rgba(63,185,80,0.1)',border:'1px solid rgba(63,185,80,0.2)'}} className="font-bold py-1 px-3 rounded-full inline-block uppercase tracking-widest">ACTIVE PROTECTION</div>
              </div>

              {!ADDRESSES[activeNetwork.id.toString()] && (
                <div className="md:col-span-2 p-8 rounded-3xl border-l-[3px] border-[#F85149] bg-[#F85149]/5 flex items-center gap-6" style={{borderRight:'1px solid rgba(255,255,255,0.06)', borderTop:'1px solid rgba(255,255,255,0.06)', borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                  <AlertTriangle size={48} style={{color:'#F85149'}} className="shrink-0" />
                  <div>
                    <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.25rem',marginBottom:'0.5rem',color:'#E8EAED'}}>Network Mismatch Detected</h3>
                    <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#F85149/80'}} className="text-white/60">We don't have contract addresses for <strong>{activeNetwork.name}</strong> in our local registry yet. Results may be limited.</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {currentView === 'info' && (
            <motion.div key="info" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl mx-auto w-full space-y-12 z-10 px-4">
              <div className="text-center space-y-3">
                <h2 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'2.5rem',color:'#E8EAED',letterSpacing:'-0.02em'}}>Technical Brief</h2>
                <div className="h-0.5 w-24 mx-auto bg-[#00E5FF]"></div>
                <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.8rem',color:'#484F58',textTransform:'uppercase',letterSpacing:'0.15em'}}>Protocol parameters and execution insights</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { icon: Target, title: 'Intent Engine', desc: 'Declaration-based execution. You specify the target outcome, and specialized solvers compete to fulfill it at zero slippage.', color: '#00E5FF' },
                  { icon: Layers, title: 'R-EVM Logic', desc: 'Powered by Reactive Network. Swaps are matched and resolved via R-EVM smart contracts autonomously and atomically.', color: '#00E5FF' },
                  { icon: Shield, title: 'Grid Security', desc: 'Autonomous dust-order monitoring. Malicious bot activity is recognized and blacklisted without involving centralized oracles.', color: '#00E5FF' }
                ].map((item, idx) => (
                  <div key={idx} className="p-8 rounded-3xl border border-white/5 hover:border-[#00E5FF]/30 transition-all group flex flex-col items-center text-center shadow-xl" style={{background:'#0D1117'}}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 relative overflow-hidden" style={{background:'#080C10', border:'1px solid rgba(255,255,255,0.04)'}}>
                      <div className="absolute inset-0 opacity-10 bg-[#00E5FF]"></div>
                      <item.icon size={32} style={{color: item.color}} />
                    </div>
                    <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.25rem',marginBottom:'1rem',color:'#E8EAED'}}>{item.title}</h3>
                    <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#8B949E',lineHeight:'1.6'}}>{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="p-10 rounded-3xl border border-white/5 flex flex-col md:flex-row gap-10 items-center relative overflow-hidden shadow-2xl" style={{background:'#0D1117'}}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#00E5FF]/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                <div className="flex-1 space-y-6 relative z-10">
                  <div className="flex items-center gap-3" style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#00E5FF'}}>
                    <Activity size={14} /> 
                    <span className="font-bold uppercase tracking-widest">Diagnostic Level: High</span>
                  </div>
                  <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'2rem',color:'#E8EAED'}}>Protocol Vital Monitor</h3>
                  <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.85rem',color:'#8B949E',lineHeight:'1.7'}}>
                    AutoSwap is currently monitoring liquidity across 5 EVM mainnets. All intent matchers are synchronized with the Reactive Network state. Matched transactions settle in <span style={{color:'#E8EAED'}}>~1,200ms</span> post-indexing.
                  </p>
                  <div className="flex flex-wrap gap-4 pt-2">
                    {[
                      { label: 'Latency', value: '12.4ms', status: '#3FB950' },
                      { label: 'R-EVM Sync', value: 'CALIBRATED', status: '#3FB950' },
                      { label: 'Mempool', value: 'NOMINAL', status: '#00E5FF' }
                    ].map((stat, i) => (
                      <div key={i} className="px-4 py-2 rounded-lg bg-[#080C10] border border-white/5 flex items-center gap-3">
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58'}} className="uppercase tracking-widest">{stat.label}:</span>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.7rem',color: stat.status, fontWeight:800}}>{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="max-w-2xl mx-auto w-full z-10 px-4">
              <div className="p-10 rounded-3xl border border-white/5 shadow-2xl flex flex-col gap-10 relative overflow-hidden" style={{background:'#0D1117'}}>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent opacity-30"></div>
                
                <section>
                  <h3 style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}} className="font-bold uppercase mb-6 tracking-widest flex items-center gap-2">
                    <Target size={12} /> Execution Strategy
                  </h3>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                      <p style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1rem',color:'#E8EAED'}}>Intent Expiry Threshold</p>
                      <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#484F58'}}>Technical time-to-live for active intents.</p>
                    </div>
                    <div className="flex gap-2 p-1 rounded-xl bg-[#080C10] border border-white/5">
                      {[
                        { label: '10M', value: 600 },
                        { label: '1H', value: 3600 },
                        { label: '24H', value: 86400 }
                      ].map(v => (
                        <button
                          key={v.label}
                          onClick={() => setExpiryDuration(v.value)}
                          style={{
                            fontFamily:'DM Mono,monospace',
                            fontSize:'0.7rem',
                            background: expiryDuration === v.value ? '#00E5FF' : 'transparent',
                            color: expiryDuration === v.value ? '#080C10' : '#484F58'
                          }}
                          className="px-4 py-2 rounded-lg font-bold transition-all uppercase tracking-widest"
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <p style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1rem',color:'#E8EAED'}}>Solver Priority Tier</p>
                      <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#484F58'}}>Gas allowance for reactive resolution.</p>
                    </div>
                    <select 
                      style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',background:'#080C10',color:'#00E5FF',border:'1px solid rgba(0,229,255,0.2)'}}
                      className="rounded-xl py-2 px-6 outline-none font-bold uppercase tracking-widest cursor-pointer"
                    >
                      <option value="Slow">Standard Output</option>
                      <option value="Standard">Optimized</option>
                      <option value="Fast">Ultra Latency</option>
                    </select>
                  </div>
                </section>

                <section className="pt-10 border-t border-white/5 space-y-8">
                  <h3 style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}} className="font-bold uppercase tracking-widest flex items-center gap-2">
                    <Activity size={12} /> System Calibration
                  </h3>
                  
                  <div className="flex justify-between items-center bg-[#080C10] p-4 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-4">
                      {isDarkMode ? <Moon size={24} style={{color:'#00E5FF'}} /> : <Sun size={24} style={{color:'#FACC15'}} />}
                      <div>
                        <p style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1rem',color:'#E8EAED'}}>{isDarkMode ? 'Lunar Interface' : 'Solar Interface'}</p>
                        <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#484F58'}}>Switch aesthetic spectrum.</p>
                      </div>
                    </div>
                    <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-12 h-6 rounded-full relative transition-colors" style={{background: isDarkMode ? '#00E5FF' : 'rgba(255,255,255,0.1)'}}>
                      <motion.div animate={{ x: isDarkMode ? 24 : 4 }} className="absolute top-1 w-4 h-4 rounded-full" style={{background: isDarkMode ? '#080C10' : '#E8EAED'}} />
                    </button>
                  </div>

                  <div className="flex justify-between items-center bg-[#F85149]/5 p-6 rounded-2xl border border-[#F85149]/20">
                    <div>
                      <p style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1rem',color:'#F85149'}}>Protocol Fault Reset</p>
                      <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#F85149/60'}} className="text-red-400 opacity-60">Purge local cache and re-sync from Reactive genesis.</p>
                    </div>
                    <button
                      onClick={handleClearCache}
                      style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',background:'rgba(248,81,73,0.1)',color:'#F85149',border:'1px solid rgba(248,81,73,0.2)'}}
                      className="px-6 py-3 rounded-xl font-bold hover:bg-[#F85149] hover:text-white transition-all uppercase tracking-widest"
                    >
                      EXECUTE PURGE
                    </button>
                  </div>
                </section>
              </div>
            </motion.div>
          )}

          {currentView === 'marketplace' && (
            <motion.div key="marketplace" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="w-full z-10">
              <MarketplacePage
                tokens={getNetworkAssets(activeNetwork.id)}
                connectedAddress={account}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAuditModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md"
              onClick={() => setShowAuditModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 30 }}
                className="max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,229,255,0.1)] rounded-[2rem] border border-white/10"
                style={{background:'#0D1117'}}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center p-8 border-b border-white/5 relative bg-[#080C10]">
                  <div className="flex items-center gap-4">
                    <Shield style={{color:'#00E5FF'}} size={28} />
                    <div>
                      <h2 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.5rem',color:'#E8EAED'}}>Audit Log v4.2</h2>
                      <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58',textTransform:'uppercase',letterSpacing:'0.2em'}}>System Integrity Verified</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAuditModal(false)} className="text-white/20 hover:text-white transition-colors p-3 rounded-full hover:bg-white/5">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                  <div className="p-5 rounded-xl border border-white/5 bg-[#080C10] mb-8" style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#8B949E',lineHeight:'1.7'}}>
                    AutoSwap Solver Protocol v1.4 (Reactive Integrated) has undergone comprehensive spectral analysis and multi-layer stress testing. 
                    Target environments: R-EVM Lasna, Sonic EVM. <br/><br/>
                    <span style={{color:'#00E5FF'}}>[VULNERABILITY RESOLUTION STATS: 26/26 CLASSIFIED AS RESOLVED]</span>
                  </div>
                  <ul className="space-y-4">
                    {auditFixes.map((fix, idx) => (
                      <motion.li
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.015 }}
                        key={idx}
                        className="flex gap-4 p-4 rounded-xl border border-white/5 bg-[#080C10]/50 hover:border-[#00E5FF]/20 transition-all group"
                      >
                        <div className="mt-1 w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF] shrink-0"></div>
                        <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.7rem',color:'#E8EAED',lineHeight:'1.5'}}>{fix}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
                <div className="p-6 text-center border-t border-white/5 bg-[#080C10]">
                   <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58'}} className="uppercase tracking-[0.3em]">Hardware Encrypted Data Flow</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showInspectModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md"
              onClick={() => { setShowInspectModal(false); setInspectedOrder(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 30 }}
                className="max-w-md w-full p-8 shadow-[0_0_80px_rgba(0,229,255,0.1)] rounded-[2rem] border border-white/10"
                style={{background:'#0D1117'}}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-10 border-b border-white/5 pb-6">
                  <div className="flex items-center gap-3">
                    <Activity style={{color:'#00E5FF'}} size={24} />
                    <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.25rem',color:'#E8EAED'}}>Order Diagnostics</h3>
                  </div>
                  <X size={20} className="cursor-pointer text-white/20 hover:text-white transition-colors" onClick={() => { setShowInspectModal(false); setInspectedOrder(null); }} />
                </div>

                {isInspecting ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-6 text-[#484F58]">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full animate-ping bg-[#00E5FF]/20" style={{margin:'-10px'}}></div>
                      <RefreshCcw className="animate-spin text-[#00E5FF] relative z-10" size={40} />
                    </div>
                    <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',fontWeight:800}} className="uppercase tracking-[0.2em]">Interrogating Contract State...</p>
                  </div>
                ) : inspectedOrder ? (
                  <div className="space-y-6">
                    <div className="bg-[#080C10] p-5 rounded-2xl border border-white/5">
                      <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58'}} className="uppercase font-bold mb-2 tracking-widest">Global Order UID</p>
                      <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.7rem',color:'#00E5FF'}} className="break-all font-bold">{inspectedOrder.id.toString()}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#080C10] p-4 rounded-2xl border border-white/5 text-center">
                        <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58'}} className="uppercase font-bold mb-2 tracking-widest">R-EVM Status</p>
                        <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.8rem',fontWeight:800,color: inspectedOrder.status === 'FILLED' ? '#3FB950' : (inspectedOrder.status === 'CANCELLED' ? '#F85149' : '#00E5FF')}}>
                          {inspectedOrder.status}
                        </p>
                      </div>
                      <div className="bg-[#080C10] p-4 rounded-2xl border border-white/5 text-center">
                        <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58'}} className="uppercase font-bold mb-2 tracking-widest">Type</p>
                        <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.8rem',fontWeight:800,color:'#E8EAED'}}>SOLITARY INTENT</p>
                      </div>
                    </div>

                    <div className="bg-[#080C10] p-6 rounded-2xl border border-white/5 space-y-4">
                       <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>TOKEN IN</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED',fontWeight:700}}>{inspectedOrder.tokenIn.substring(0,8)}...{inspectedOrder.tokenIn.substring(38)}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>TOKEN OUT</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED',fontWeight:700}}>{inspectedOrder.tokenOut.substring(0,8)}...{inspectedOrder.tokenOut.substring(38)}</span>
                       </div>
                       <div className="h-px bg-white/5"></div>
                       <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>EXPIRATION</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED',fontWeight:700}}>{inspectedOrder.expiration}</span>
                       </div>
                       <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>MAKER</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#00E5FF',fontWeight:700}}>{inspectedOrder.maker.substring(0,6)}...{inspectedOrder.maker.substring(38)}</span>
                       </div>
                    </div>

                    <button 
                      onClick={() => { setShowInspectModal(false); setInspectedOrder(null); }}
                      style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',background:'#00E5FF',color:'#080C10'}}
                      className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(0,229,255,0.2)]"
                    >
                      Close Diagnostics
                    </button>
                    
                    {inspectedOrder.id && !inspectedOrder.id.toString().startsWith('temp-') && (
                      <a 
                        href={`${activeNetwork.explorer}/address/${ADDRESSES[activeNetwork.id.toString()]?.EulerLagrangeOrderProcessor}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{fontFamily:'DM Mono,monospace',fontSize:'0.6rem',color:'#484F58'}}
                        className="flex items-center justify-center gap-2 hover:text-white transition-colors"
                      >
                        VIEW PROCESSOR CONTRACT <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-red-400 text-sm">
                    Failed to load order data.
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAddCustomTokenModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md"
              onClick={() => setShowAddCustomTokenModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                className="max-w-sm w-full p-8 rounded-[2rem] border border-white/10 shadow-[0_0_80px_rgba(0,229,255,0.1)]"
                style={{background:'#0D1117'}}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                  <div className="flex items-center gap-3">
                    <Zap style={{color:'#00E5FF'}} size={20} />
                    <h3 style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:'1.25rem',color:'#E8EAED'}}>Import Token</h3>
                  </div>
                  <X size={20} className="cursor-pointer text-white/20 hover:text-white transition-colors" onClick={() => setShowAddCustomTokenModal(false)} />
                </div>

                <div className="p-4 rounded-xl border border-[#FACC15]/20 bg-[#FACC15]/5 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} style={{color:'#FACC15'}} />
                    <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#FACC15',fontWeight:800}} className="uppercase tracking-widest">Security Warning</span>
                  </div>
                  <p style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#FACC15',opacity:0.8,lineHeight:'1.5'}}>
                    Anyone can create a token with any name. Importing unknown assets can lead to permanent loss of funds. Verify the contract address.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}} className="font-bold uppercase tracking-widest block">Contract Address</label>
                    <input
                      type="text"
                      className="w-full bg-[#080C10] border border-white/10 rounded-xl py-4 px-4 text-sm outline-none focus:border-[#00E5FF]/50 transition-all text-white placeholder-white/10"
                      style={{fontFamily:'DM Mono,monospace'}}
                      placeholder="0x..."
                      value={customTokenAddressInput}
                      onChange={(e) => {
                        setCustomTokenAddressInput(e.target.value);
                        setCustomTokenPreview(null);
                      }}
                    />
                  </div>

                  {!customTokenPreview ? (
                    <button
                      onClick={handleFetchCustomToken}
                      disabled={isFetchingCustomToken || !customTokenAddressInput}
                      style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',background: (isFetchingCustomToken || !customTokenAddressInput) ? 'rgba(255,255,255,0.05)' : '#00E5FF', color: (isFetchingCustomToken || !customTokenAddressInput) ? 'rgba(255,255,255,0.2)' : '#080C10'}}
                      className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50"
                    >
                      {isFetchingCustomToken ? 'Querying...' : 'FETCH PARAMETERS'}
                    </button>
                  ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="bg-[#080C10] p-6 rounded-2xl border border-white/5 space-y-4">
                        <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>SYMBOL</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#00E5FF',fontWeight:800}}>{customTokenPreview.symbol}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>NAME</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED',fontWeight:800}}>{customTokenPreview.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>DECIMALS</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED',fontWeight:800}}>{customTokenPreview.decimals}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.65rem',color:'#484F58'}}>CHAIN ID</span>
                          <span style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',color:'#E8EAED',fontWeight:800}}>{customTokenPreview.chainId}</span>
                        </div>
                      </div>

                      <button
                        onClick={handleAddCustomToken}
                        style={{fontFamily:'DM Mono,monospace',fontSize:'0.75rem',background:'#00E5FF',color:'#080C10'}}
                        className="w-full py-4 rounded-xl font-bold uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(0,229,255,0.2)]"
                      >
                        CONFIRM IMPORT
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

export default App;
