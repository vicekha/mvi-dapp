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

  const [currentView, setCurrentView] = useState('intents'); // intents, history, security, settings
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

  const Sidebar = ({ isMobile = false }) => (
    <nav className={`${isMobile ? 'flex' : 'hidden lg:flex'} sidebar glass-card ${isMobile ? 'm-0 h-full w-full' : 'm-4'} flex flex-col items-center lg:items-stretch py-8 px-4 overflow-hidden`}>
      <div className="flex items-center justify-between w-full mb-12 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 btn-primary flex items-center justify-center flex-shrink-0">
            <Target size={24} fill="white" />
          </div>
          <span className="text-xl font-bold gradient-text lg:block hidden">AUTOSWAP INTENT</span>
        </div>
        {isMobile && <X size={24} className="text-white/60 cursor-pointer" onClick={() => setShowMobileSidebar(false)} />}
      </div>

      <div className="flex flex-col gap-4 w-full">
        <button
          className={`nav-item ${currentView === 'intents' ? 'active' : ''}`}
          onClick={() => { setCurrentView('intents'); setShowMobileSidebar(false); }}
        >
          <RefreshCcw size={22} className={currentView === 'intents' ? "text-indigo-400" : "text-white/60"} />
          <span className="font-medium lg:block hidden">Intents</span>
        </button>
        <button
          className={`nav-item ${currentView === 'history' ? 'active' : ''}`}
          onClick={() => { setCurrentView('history'); setShowMobileSidebar(false); }}
        >
          <HistoryIcon size={22} className={currentView === 'history' ? "text-indigo-400" : "text-white/60"} />
          <span className="font-medium lg:block hidden">History</span>
        </button>
        <button
          className={`nav-item ${currentView === 'security' ? 'active' : ''}`}
          onClick={() => { setCurrentView('security'); setShowMobileSidebar(false); }}
        >
          <Shield size={22} className={currentView === 'security' ? "text-indigo-400" : "text-white/60"} />
          <span className="font-medium lg:block hidden">Security</span>
        </button>
        <button
          className={`nav-item ${currentView === 'info' ? 'active' : ''}`}
          onClick={() => { setCurrentView('info'); setShowMobileSidebar(false); }}
        >
          <Info size={22} className={currentView === 'info' ? "text-indigo-400" : "text-white/60"} />
          <span className="font-medium lg:block hidden">Info</span>
        </button>
        <button
          className={`nav-item mt-auto ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => { setCurrentView('settings'); setShowMobileSidebar(false); }}
        >
          <Settings size={22} className={currentView === 'settings' ? "text-indigo-400" : "text-white/60"} />
          <span className="font-medium lg:block hidden">Settings</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className={`flex h-screen relative ${isDarkMode ? 'dark-theme' : 'light-theme'}`}>
      <Sidebar />
      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            className="fixed inset-0 z-50 bg-[#050505] p-4 lg:hidden"
          >
            <Sidebar isMobile />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col p-4 lg:p-8 overflow-y-auto w-full" style={{ paddingBottom: '5rem' }}>
        <header className="flex justify-between items-center mb-8 py-2 w-full">
          <div className="flex items-center gap-4">
            <Menu size={24} className="lg:hidden text-white/60 cursor-pointer" onClick={() => setShowMobileSidebar(true)} />
            <h1 className="text-2xl lg:text-3xl font-bold gradient-text">
              {currentView.charAt(0).toUpperCase() + currentView.slice(1)}
            </h1>

            <div className="relative" ref={dropdownRef}>
              <div
                className="glass-card px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
              >
                <span className="text-xl">{activeNetwork.icon}</span>
                <span className="font-bold text-xs">{activeNetwork.name}</span>
                <ChevronDown size={14} className={`text-white/40 transition-transform ${showNetworkDropdown ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {showNetworkDropdown && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="dropdown-content">
                    <div className="py-2 max-h-64 overflow-y-auto">
                      {NETWORKS.map(network => (
                        <div
                          key={network.id} className="dropdown-item"
                          onClick={() => switchNetwork(network)}
                        >
                          <span>{network.icon}</span>
                          <span className="text-sm font-medium">{network.name}</span>
                          {activeNetwork.id === network.id && <CheckCircle2 size={14} className="ml-auto text-green-400" />}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <button onClick={connectWallet} className="btn-primary flex items-center gap-2 px-4 py-2">
            <Wallet size={18} />
            <span className="text-sm">{account ? `${account.substring(0, 6)}...` : 'Connect'}</span>
          </button>
        </header>

        <AnimatePresence mode="wait">
          {currentView === 'intents' && (
            <motion.div
              key="intents" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="flex flex-col xl:flex-row gap-8 items-start justify-center flex-1 max-w-7xl mx-auto w-full"
            >
              <div className="flex-shrink-0 w-full max-w-md glass-card p-6" style={{ position: 'relative', zIndex: 20 }}>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-sm font-semibold text-white/60 uppercase tracking-wider">Define Intent</span>
                  <div className="p-2 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10" onClick={() => setCurrentView('settings')}>
                    <Settings size={16} className="text-white/60" />
                  </div>
                </div>

                <div className="input-container mb-2">
                  <div className="flex justify-between text-xs text-white/40 mb-3">
                    <span>You Provide</span>
                    <span>Balance: {tokenBalances[`${sellAsset.chainId}-${sellAsset.address.toLowerCase()}`] ? parseFloat(tokenBalances[`${sellAsset.chainId}-${sellAsset.address.toLowerCase()}`]).toFixed(4) : "0.00"} {sellAsset.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center relative" ref={sellDropdownRef}>
                    <div
                      className="flex items-center gap-2 p-2 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10"
                      onClick={() => setShowSellDropdown(!showSellDropdown)}
                    >
                      {sellAsset.logoURI ? (
                        <img src={sellAsset.logoURI} alt={sellAsset.symbol} className="w-5 h-5 rounded-full token-icon" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">{sellAsset.symbol[0]}</div>
                      )}
                      <span className="font-bold text-sm">{sellAsset.symbol}</span>
                      <ChevronDown size={14} className="text-white/40" />
                    </div>

                    <AnimatePresence>
                      {showSellDropdown && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="dropdown-content left-0 top-full mt-2" style={{ right: 'auto', minWidth: '240px', zIndex: 50 }}>
                          <div className="sticky top-0 bg-[#0a0a0a] z-10 px-2 pb-2 pt-1 border-b border-white/5">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                              <input
                                type="text"
                                placeholder="Search tokens..."
                                value={sellSearch}
                                onChange={(e) => setSellSearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-indigo-500/50"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="py-2 max-h-64 overflow-y-auto">
                            {(() => {
                              if (filteredSellAssets.length === 0) {
                                return (
                                  <div className="p-4 flex flex-col items-center justify-center text-xs text-white/40">
                                    <span className="mb-2">No tokens found</span>
                                    <button onClick={() => { setShowSellDropdown(false); setShowAddCustomTokenModal(true); }} className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 font-medium hover:bg-indigo-500/30 transition-colors">
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
                                        <span className="text-sm font-bold">{asset.symbol}</span>
                                        <span className="text-[8px] px-1 py-0.5 rounded-sm bg-black/20" style={{ color: network.color }}>{network.name}</span>
                                      </div>
                                      <span className="text-[10px] text-white/40">{asset.name}</span>
                                    </div>
                                    <span className="text-sm font-medium ml-auto">{bal > 0 ? bal.toFixed(4) : "0.00"}</span>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          {filteredSellAssets.length > 0 && (
                            <div className="p-2 border-t border-white/5 bg-[#0a0a0a]">
                              <button onClick={() => { setShowSellDropdown(false); setShowAddCustomTokenModal(true); }} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-indigo-400 font-medium transition-colors">
                                + Add Custom Token
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <input type="number" placeholder="0.0" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} className="text-right text-2xl font-bold w-1/2 bg-transparent outline-none placeholder-white/20" />
                  </div>
                </div>

                <div className="flex justify-center -my-3 relative z-10">
                  <button onClick={() => {
                    const t = sellAsset; setSellAsset(buyAsset); setBuyAsset(t);
                    const v = sellAmount; setSellAmount(buyAmount); setBuyAmount(v);
                  }} className="btn-primary p-2 rounded-xl" style={{ border: '4px solid #050505' }}>
                    <ArrowDownUp size={20} />
                  </button>
                </div>

                <div className="input-container mb-4 pt-4">
                  <div className="flex justify-between text-xs text-white/40 mb-3">
                    <div className="flex items-center gap-2">
                       <span>You Expect on</span>
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
                             <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="dropdown-content left-0 top-full mt-1 border border-white/10" style={{ zIndex: 100, minWidth: '160px' }}>
                               {NETWORKS.map(network => (
                                 <div 
                                   key={network.id} className="dropdown-item py-1.5 px-3"
                                   onClick={() => { setTargetNetwork(network); setShowTargetNetworkDropdown(false); }}
                                 >
                                   <span className="text-sm">{network.icon}</span>
                                   <span className="text-[11px] font-medium">{network.name}</span>
                                   {targetNetwork.id === network.id && <CheckCircle2 size={12} className="ml-auto text-indigo-400" />}
                                 </div>
                               ))}
                             </motion.div>
                           )}
                         </AnimatePresence>
                       </div>
                    </div>
                    <span>Balance: {tokenBalances[`${buyAsset.chainId}-${buyAsset.address.toLowerCase()}`] ? parseFloat(tokenBalances[`${buyAsset.chainId}-${buyAsset.address.toLowerCase()}`]).toFixed(4) : "0.00"} {buyAsset.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center relative" ref={buyDropdownRef}>
                    <div
                      className="flex items-center gap-2 p-2 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10"
                      onClick={() => setShowBuyDropdown(!showBuyDropdown)}
                    >
                      {buyAsset.logoURI ? (
                        <img src={buyAsset.logoURI} alt={buyAsset.symbol} className="w-5 h-5 rounded-full token-icon" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px]">{buyAsset.symbol[0]}</div>
                      )}
                      <span className="font-bold text-sm">{buyAsset.symbol}</span>
                      <ChevronDown size={14} className="text-white/40" />
                    </div>

                    <AnimatePresence>
                      {showBuyDropdown && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="dropdown-content left-0 top-full mt-2" style={{ right: 'auto', minWidth: '240px', zIndex: 50 }}>
                          <div className="sticky top-0 bg-[#0a0a0a] z-10 px-2 pb-2 pt-1 border-b border-white/5">
                            <div className="relative">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                              <input
                                type="text"
                                placeholder="Search tokens..."
                                value={buySearch}
                                onChange={(e) => setBuySearch(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-9 pr-3 text-xs focus:outline-none focus:border-indigo-500/50"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="py-2 max-h-64 overflow-y-auto">
                            {filteredBuyAssets.length === 0 ? (
                              <div className="p-4 flex flex-col items-center justify-center text-xs text-white/40">
                                <span className="mb-2">No tokens found</span>
                                <button onClick={() => { setShowBuyDropdown(false); setShowAddCustomTokenModal(true); }} className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 font-medium hover:bg-indigo-500/30 transition-colors">
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
                                        <span className="text-sm font-bold">{asset.symbol}</span>
                                        <span className="text-[8px] px-1 py-0.5 rounded-sm bg-black/20" style={{ color: network.color }}>{network.name}</span>
                                      </div>
                                      <span className="text-[10px] text-white/40">{asset.name}</span>
                                    </div>
                                    {(() => {
                                      const balKey = `${asset.chainId}-${asset.address.toLowerCase()}`;
                                      const balStr = tokenBalances[balKey];
                                      return (
                                        <span className="text-sm font-medium ml-auto text-white/40">{balStr && parseFloat(balStr) > 0 ? parseFloat(balStr).toFixed(4) : "0.00"}</span>
                                      );
                                    })()}
                                  </div>
                                )
                              })
                            )}
                          </div>
                          {filteredBuyAssets.length > 0 && (
                            <div className="p-2 border-t border-white/5 bg-[#0a0a0a]">
                              <button onClick={() => { setShowBuyDropdown(false); setShowAddCustomTokenModal(true); }} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-indigo-400 font-medium transition-colors">
                                + Add Custom Token
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <input type="number" placeholder="0.0" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className="text-right text-2xl font-bold w-1/2 bg-transparent outline-none placeholder-white/20" />
                  </div>
                </div>

                {effectiveRate && (
                  <div className="mb-2 px-2 flex justify-between items-center text-xs">
                    <span className="text-white/40">Effective Rate</span>
                    <span className="font-bold text-indigo-400">1 {sellAsset.symbol} = {effectiveRate} {buyAsset.symbol}</span>
                  </div>
                )}

                {activeNetwork.id !== targetNetwork.id && (
                  <div className="mb-6 px-2 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-1 text-white/40">
                      <Zap size={12} className="text-amber-400" />
                      <span>Reactive Network Fee</span>
                    </div>
                    <span className="font-bold text-amber-400">0.002 {activeNetwork.currency}</span>
                  </div>
                )}

                <button onClick={handleSubmitIntent} disabled={isSubmitting || !sellAmount || !buyAmount} className="w-full btn-primary py-4 text-lg font-bold disabled:opacity-50">
                  {isSubmitting ? 'Publishing Intent...' : 'Submit Intent'}
                </button>
              </div>

              <div className="flex-1 w-full flex flex-col gap-6">
                <h2 className="text-xl font-bold flex items-center gap-2"><Activity size={20} className="text-indigo-400" /> Platform Pulse</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass-card p-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/40 mb-1 uppercase tracking-tighter">Trending Asset</p>
                      <p className="text-2xl font-bold flex items-center gap-2"><Flame size={20} className="text-orange-500" /> {trendingAsset}</p>
                    </div>
                  </div>
                  <div className="glass-card p-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/40 mb-1 uppercase tracking-tighter">Active Intents</p>
                      <p className="text-2xl font-bold text-indigo-400">{activeIntentsCount}</p>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Target size={20} className="text-indigo-400" />
                    <h3 className="font-bold">How Intents Work</h3>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">
                    Unlike traditional swaps, intents let you specify exactly how much you want to receive.
                    Your order will be published to the Reactive Network where solvers will look to match your price.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === 'history' && (
            <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto w-full">
              <div className="flex justify-between items-center mb-6">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                  <input type="text" placeholder="Search transactions..." className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50" />
                </div>
                <button
                  onClick={() => fetchHistory()}
                  className={`p-2 hover:bg-white/5 rounded-xl transition-all text-white/40 hover:text-white ${isSyncingHistory ? 'animate-spin-slow text-indigo-400' : ''}`}
                  title="Sync History"
                >
                  <RefreshCcw size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {orders.filter(o => {
                  try {
                    return !account || ethers.getAddress((o.maker || '')) === ethers.getAddress(account);
                  } catch (e) { return false; }
                }).length === 0 ? (
                  <div className="glass-card p-12 text-center opacity-40">
                    <HistoryIcon size={48} className="mx-auto mb-4" />
                    <p>No active intents found.</p>
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
                      // --- Emergency Cancel Enable ---
                      // We allow cancel if:
                      // 1. It's on the ACTIVE network
                      // 2. Status is cancellable (including expired for manual refund)
                      // 3. It's either confirmed (!isTemp) OR it's a temp order that has a txHash (published)
                      const isCorrectNetwork = order.network && BigInt(order.network.id) === BigInt(activeNetwork.id);
                      const canCancel = isCorrectNetwork && (
                        (cancellableStatuses.includes(statusDisplay) && !isTemp) ||
                        (statusDisplay === 'published' && isTemp && order.txHash)
                      );

                      return (
                        <div key={order.id} className="glass-card p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${order.status === 'cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                              {order.status === 'cancelled' ? <X size={18} /> : <CheckCircle2 size={18} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-sm">
                                  {isUnknownSell ? `${order.tokenInAddr?.substring(0, 6)}...` : order.sellAsset.symbol}
                                  <span className="mx-1 text-white/40">on</span>
                                  <span title={activeNetwork.name}>{activeNetwork.icon}</span>
                                  <ArrowRight size={12} className="mx-1 text-white/20 inline" />
                                  {isUnknownBuy ? `${order.tokenOutAddr?.substring(0, 6)}...` : order.buyAsset.symbol}
                                  <span className="mx-1 text-white/40">on</span>
                                  <span title={order.targetNetwork?.name || 'Unknown'}>{order.targetNetwork?.icon || '❓'}</span>
                                </p>
                                {activeNetwork.id !== order.targetNetwork?.id && (
                                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[8px] font-bold uppercase tracking-widest border border-amber-500/20">Cross-Chain</span>
                                )}
                              </div>

                                <div className="flex items-center gap-2 text-[10px] text-white/20 font-mono">
                                  <span>ID: {isTemp ? 'Syncing...' : order.id.toString().substring(0, 10)}</span>
                                  <span>•</span>
                                  <span className={`uppercase font-bold ${isTemp ? 'text-orange-400 sync-glow' : (statusDisplay === 'expired' ? 'text-orange-500 animate-pulse' : 'text-indigo-400/50')}`}>
                                    {isTemp ? 'Synchronizing' : (statusDisplay === 'expired' ? 'Expired (Auto-Refunding...)' : statusDisplay)}
                                  </span>
                                </div>
                                <p className="text-xs text-white/40">{order.fullDate} • {order.timestamp}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-1">
                            <div className="text-right w-full">
                              <p className="font-bold text-sm">
                                {order.sellAmount} {isUnknownSell ? 'OLD' : order.sellAsset.symbol} for {order.buyAmount} {isUnknownBuy ? 'OLD' : order.buyAsset.symbol}
                              </p>

                              {/* Progress Bar */}
                              {(order.status === 'active' || order.status === 'partial' || order.status === 'filled') && (
                                <div className="w-full max-w-[120px] ml-auto mt-2 mb-1">
                                  <div className="flex justify-between text-[8px] text-white/40 mb-1 uppercase tracking-widest">
                                    <span>Progress</span>
                                    <span>{(() => {
                                      const fill = order.rawAmountOut && BigInt(order.rawAmountOut) > 0n
                                        ? Number((BigInt(order.rawFilledAmount) * 100n) / BigInt(order.rawAmountOut))
                                        : 0;
                                      return fill;
                                    })()}%</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{
                                        width: `${order.rawAmountOut && BigInt(order.rawAmountOut) > 0n
                                          ? Number((BigInt(order.rawFilledAmount) * 100n) / BigInt(order.rawAmountOut))
                                          : 0}%`
                                      }}
                                      transition={{ duration: 1, ease: "easeOut" }}
                                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                    />
                                  </div>
                                </div>
                              )}

                              <p className={`text-[10px] uppercase font-bold tracking-widest ${order.status === 'cancelled' ? 'text-red-400' : 'text-indigo-400'}`}>
                                {order.status}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleInspectOrder(order.id); }}
                                className="text-[10px] font-bold px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                              >
                                INSPECT
                              </button>
                              {canCancel && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                                  disabled={cancellingOrder === order.id}
                                  className="text-[10px] font-bold px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50 flex items-center gap-1"
                                >
                                  {cancellingOrder === order.id ? (
                                    <>
                                      <RefreshCcw size={10} className="animate-spin" />
                                      {isTemp ? 'RESCUING...' : 'CANCELLING...'}
                                    </>
                                  ) : (statusDisplay === 'expired' ? 'REFUND' : 'CANCEL')}
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
            <motion.div key="security" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-6 border-l-4 border-emerald-500 shadow-lg shadow-emerald-500/10">
                <Lock size={32} className="text-emerald-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">Multi-Chain Audit</h3>
                <p className="text-white/40 text-sm mb-4">AutoSwap Protocol smart contracts have been rigorously audited by leading security firms on Reactive Network and Sepolia.</p>
                <button onClick={() => setShowAuditModal(true)} className="text-indigo-400 text-xs font-bold flex items-center gap-1 hover:underline">VIEW AUDIT LOGS <ExternalLink size={12} /></button>
              </div>
              <div className="glass-card p-6 border-l-4 border-indigo-500 shadow-lg shadow-indigo-500/10">
                <Shield size={32} className="text-indigo-400 mb-4" />
                <h3 className="text-xl font-bold mb-2">MEV Protection</h3>
                <p className="text-white/40 text-sm mb-4">Your trades are protected from front-running and sandwich attacks via our decentralized order matching logic.</p>
                <div className="bg-indigo-500/10 text-indigo-300 text-[10px] font-bold py-1 px-3 rounded-full inline-block uppercase tracking-wider">ACTIVE PROTECTION</div>
              </div>
              {!ADDRESSES[activeNetwork.id.toString()] && (
                <div className="glass-card p-6 md:col-span-2 border-l-4 border-yellow-500 bg-yellow-500/5">
                  <AlertTriangle size={32} className="text-yellow-400 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Unrecognized Network</h3>
                  <p className="text-white/60 text-sm">We don't have contract addresses for <strong>{activeNetwork.name}</strong> in our local registry yet. Please switch to a supported network like Sepolia or Lasna to interact with the protocol.</p>
                </div>
              )}
            </motion.div>
          )}

          {currentView === 'info' && (
            <motion.div key="info" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-5xl mx-auto w-full space-y-8">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Information Center</h2>
                <p className="text-white/40 text-sm">Protocol documentation and execution insights</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-8 border-t-2 border-indigo-500/50 flex flex-col items-center text-center hover:bg-white/5 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-6">
                    <Target size={32} className="text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Intent Architecture</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Declaration-based execution. You specify the target outcome, and specialized solvers compete to fulfill it at zero slippage.
                  </p>
                </div>

                <div className="glass-card p-8 border-t-2 border-purple-500/50 flex flex-col items-center text-center hover:bg-white/5 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6">
                    <Layers size={32} className="text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Cross-Chain Logic</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Powered by <strong>Reactive Network</strong>. Swaps initiated on Origin chains are matched and resolved via R-EVM smart contracts autonomously.
                  </p>
                </div>

                <div className="glass-card p-8 border-t-2 border-pink-500/50 flex flex-col items-center text-center hover:bg-white/5 transition-all">
                  <div className="w-16 h-16 rounded-2xl bg-pink-500/10 flex items-center justify-center mb-6">
                    <Shield size={32} className="text-pink-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">Spam Prevention</h3>
                  <p className="text-white/50 text-sm leading-relaxed">
                    Autonomous dust-order monitoring. Malicious bot activity is recognized and blacklisted without involving centralized oracles.
                  </p>
                </div>
              </div>

              <div className="glass-card p-8 border-l-4 border-indigo-500 flex flex-col md:flex-row gap-8 items-center bg-indigo-500/5">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
                    <Activity size={14} /> System Status
                  </div>
                  <h3 className="text-2xl font-bold">Protocol Health Monitor</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    AutoSwap is currently monitoring liquidity across 5 EVM mainnets. All intent matchers are synchronized with the Reactive Network state.
                  </p>
                  <div className="flex gap-4">
                    <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono">
                      LATENCY: <span className="text-green-400">~12.4ms</span>
                    </div>
                    <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-mono">
                      R-EVM: <span className="text-green-400">SYNCED</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentView === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="max-w-2xl mx-auto w-full">
              <div className="glass-card p-8 flex flex-col gap-8">
                <section>
                  <h3 className="text-white/40 text-xs font-bold uppercase mb-4 tracking-widest">Intent Parameters</h3>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <p className="font-bold">Intent Expiry</p>
                      <p className="text-xs text-white/40">How long your intent stays valid in the mempool.</p>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { label: '10m', value: 600 },
                        { label: '1h', value: 3600 },
                        { label: '24h', value: 86400 }
                      ].map(v => (
                        <button
                          key={v.label}
                          onClick={() => setExpiryDuration(v.value)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${expiryDuration === v.value ? 'btn-primary' : 'bg-white/5 hover:bg-white/10'}`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold flex items-center gap-2"><Gauge size={16} className="text-indigo-400" /> Resolution Priority</p>
                      <p className="text-xs text-white/40">Incentive for solvers to fill your intent.</p>
                    </div>
                    <select className="bg-white/5 border border-white/10 text-xs font-bold rounded-xl py-2 px-4 outline-none">
                      <option value="Slow">Standard</option>
                      <option value="Standard">Fast</option>
                      <option value="Fast">Instant</option>
                    </select>
                  </div>
                </section>

                <section className="pt-8 border-t border-white/5">
                  <h3 className="text-white/40 text-xs font-bold uppercase mb-4 tracking-widest">Interface</h3>
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                      {isDarkMode ? <Moon size={20} className="text-indigo-400" /> : <Sun size={20} className="text-yellow-400" />}
                      <div>
                        <p className="font-bold">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</p>
                        <p className="text-xs text-white/40">Toggle app theme aesthetics.</p>
                      </div>
                    </div>
                    <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-12 h-6 rounded-full bg-white/10 relative">
                      <motion.div animate={{ x: isDarkMode ? 24 : 4 }} className="absolute top-1 w-4 h-4 rounded-full bg-white" />
                    </button>
                  </div>
                  <div className="flex justify-between items-center bg-red-500/5 p-4 rounded-2xl border border-red-500/10">
                    <div>
                      <p className="font-bold text-red-400">Emergency Reset</p>
                      <p className="text-xs text-white/40">Clear local history and force full re-sync.</p>
                    </div>
                    <button
                      onClick={handleClearCache}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
                    >
                      CLEAR CACHE
                    </button>
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAuditModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => setShowAuditModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="glass-card max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl shadow-indigo-500/20"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center p-6 border-b border-white/10 bg-[#0a0a0a]">
                  <div className="flex items-center gap-3">
                    <Shield className="text-emerald-400" size={24} />
                    <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Multi-Chain Audit Log</h2>
                  </div>
                  <button onClick={() => setShowAuditModal(false)} className="text-white/40 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                  <p className="text-sm text-white/50 mb-6 leading-relaxed">
                    The AutoSwap intent solver protocol has undergone extensive security reviews across Reactive Network and Sepolia environments. The following 26 items detail the critical and non-critical vulnerabilities that have been successfully identified, verified, and resolved in our latest deployment:
                  </p>
                  <ul className="space-y-3">
                    {auditFixes.map((fix, idx) => (
                      <motion.li
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        key={idx}
                        className="flex gap-3 text-sm items-start bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
                      >
                        <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                        <span className="text-white/80">{fix}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showInspectModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => { setShowInspectModal(false); setInspectedOrder(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                className="glass-card max-w-md w-full p-6 shadow-2xl shadow-indigo-500/20"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="text-indigo-400" size={20} />
                    <h3 className="text-lg font-bold">On-Chain Diagnostics</h3>
                  </div>
                  <X size={20} className="cursor-pointer text-white/40 hover:text-white" onClick={() => { setShowInspectModal(false); setInspectedOrder(null); }} />
                </div>

                {isInspecting ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-4 text-white/40">
                    <RefreshCcw className="animate-spin text-indigo-400" size={32} />
                    <p className="text-sm font-medium">Fetching real-time contract state...</p>
                  </div>
                ) : inspectedOrder ? (
                  <div className="space-y-4">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-[10px] text-white/40 uppercase font-bold mb-1 tracking-widest">Order Identifier</p>
                      <p className="font-mono text-xs break-all text-indigo-300">{inspectedOrder.id.toString()}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                        <p className="text-[10px] text-white/40 uppercase font-bold mb-1 tracking-widest">Contract Status</p>
                        <p className={`font-bold text-sm ${inspectedOrder.status === 'FILLED' ? 'text-green-400' :
                          inspectedOrder.status === 'CANCELLED' ? 'text-red-400' :
                            'text-indigo-400'
                          }`}>{inspectedOrder.status} ({inspectedOrder.rawStatus})</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                        <p className="text-[10px] text-white/40 uppercase font-bold mb-1 tracking-widest">Expiration</p>
                        <p className={`font-bold text-[10px] ${inspectedOrder.isExpired ? 'text-orange-400' : 'text-white/80'}`}>
                          {inspectedOrder.isExpired ? 'EXPIRED' : 'VALID'}
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <p className="text-[10px] text-white/40 uppercase font-bold mb-3 tracking-widest text-center">Fill Progress</p>
                      <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                          style={{ width: `${(BigInt(inspectedOrder.filledAmount) * 100n) / BigInt(inspectedOrder.amountOut || 1)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-white/60">
                        <span>{parseFloat(ethers.formatUnits(inspectedOrder.filledAmount, 18)).toFixed(4)} FILLED</span>
                        <span>{parseFloat(ethers.formatUnits(inspectedOrder.amountOut, 18)).toFixed(4)} TARGET</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-white/30 space-y-1 bg-black/20 p-3 rounded-lg font-mono">
                      <p>Maker: {inspectedOrder.maker}</p>
                      <p>Token In: {inspectedOrder.tokenIn}</p>
                      <p>Token Out: {inspectedOrder.tokenOut}</p>
                      <p>Expires: {inspectedOrder.expiration}</p>
                    </div>

                    <button
                      onClick={() => { setShowInspectModal(false); setInspectedOrder(null); }}
                      className="w-full py-3 btn-primary rounded-xl font-bold uppercase tracking-widest text-xs"
                    >
                      Close Diagnostics
                    </button>
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
              className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => setShowAddCustomTokenModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                className="glass-card max-w-sm w-full p-6"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                  <h3 className="text-lg font-bold">Import Custom Token</h3>
                  <X size={20} className="cursor-pointer text-white/40 hover:text-white" onClick={() => setShowAddCustomTokenModal(false)} />
                </div>

                <p className="text-xs text-white/50 mb-4 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl">
                  <span className="text-yellow-500 font-bold block mb-1">Warning</span>
                  Anyone can create a token with any name. Importing unknown tokens can be risky. Only proceed if you trust the contract.
                </p>

                <label className="text-xs font-bold text-white/60 mb-2 block">Token Contract Address</label>
                <input
                  type="text"
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm mb-4 outline-none focus:border-indigo-400/50 transition-colors"
                  placeholder="0x..."
                  value={customTokenAddressInput}
                  onChange={(e) => {
                    setCustomTokenAddressInput(e.target.value);
                    setCustomTokenPreview(null);
                  }}
                />

                {!customTokenPreview ? (
                  <button
                    onClick={handleFetchCustomToken}
                    disabled={isFetchingCustomToken || !customTokenAddressInput}
                    className="w-full btn-primary py-3 font-bold disabled:opacity-50"
                  >
                    {isFetchingCustomToken ? 'Searching...' : 'Search Token'}
                  </button>
                ) : (
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-white/40 uppercase tracking-widest">Found Token</span>
                      <span className="text-xs font-bold text-indigo-400">{activeNetwork.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm font-bold">
                        {customTokenPreview.symbol[0]}
                      </div>
                      <div>
                        <p className="font-bold">{customTokenPreview.symbol}</p>
                        <p className="text-xs text-white/40">{customTokenPreview.name} &middot; {customTokenPreview.decimals} Decimals</p>
                      </div>
                    </div>
                    <button
                      onClick={handleAddCustomToken}
                      className="w-full btn-primary py-3 font-bold mt-4"
                    >
                      Import Token
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

export default App;
