export const CONTRACTS: Record<number, {
    WALLET_SWAP_MAIN: string;
    ORDER_PROCESSOR: string;
    FEE_DISTRIBUTOR: string;
    ASSET_VERIFIER: string;
    SWAP_MATCHER_RSC?: string;
    VIRTUAL_LIQUIDITY_POOL?: string;
    EULER_LAGRANGE_ORDER_PROCESSOR?: string;
    TRUST_WALLET_FEE_DISTRIBUTOR?: string;
}> = {
    // Anvil (Local) - Final with VirtualLiquidityPool native ETH fix
    31337: {
        WALLET_SWAP_MAIN: '0xa4c6B4119C06F511734aF81Ba18251ACfed7e5CE',
        ORDER_PROCESSOR: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
        FEE_DISTRIBUTOR: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
        ASSET_VERIFIER: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    },
    // Polygon Amoy
    80002: {
        WALLET_SWAP_MAIN: '0xAD18d2B0578388fc4078C1cd7037e7c05E04014C',
        ORDER_PROCESSOR: '0x74f793F9dA171F9aE8a4D2C8105379bF0227AC30',
        FEE_DISTRIBUTOR: '0x6bA4562D639D21B3446ceC05Ba70e69AF926Fd0a',
        ASSET_VERIFIER: '0x7EB1299099c2d781a28ac21f8D5cF0137E6C37AC',
    },
    // Lasna Testnet (Reactive Network) - UPDATED: 2026-01-28 (Graceful Liquidity Reduction)
    5318007: {
        WALLET_SWAP_MAIN: '0x61274f9ccf9708ad588c21aaf07bfc1c214ccc01',
        ORDER_PROCESSOR: '0x3e7b9b769212abc0e1aa8926fb7f65e083fc0ea3',
        FEE_DISTRIBUTOR: '0xb2d84e84cb1c3e75962a27bfba21d0bace2af319',
        ASSET_VERIFIER: '0xbd5b66622e1a53d19673ddc3b1056638258277fe',
        VIRTUAL_LIQUIDITY_POOL: '0x21f16b51e3714d3a66cbf58521d8eb2feedcaf0c'
    },
    // Sepolia Testnet - UPDATED: 2026-01-26 (Redeployment Fix)
    11155111: {
        WALLET_SWAP_MAIN: '0xb8489abc7f5df9add04579bb74ec3c958d59ee21',
        ORDER_PROCESSOR: '0x3c85d9903327d6b2290ce8493e5e7e1f9c06f52d',
        FEE_DISTRIBUTOR: '0x9d04018fe3e41d8283231527b10fff66fe3f2020',
        ASSET_VERIFIER: '0xe6f6fa8a2eb90b3c30f59334d6947d0f119fb4af',
        VIRTUAL_LIQUIDITY_POOL: '0xfcf36d125b489acb6c64bc3c5c19a5268c29dc95',
    }
};

// Chain configurations
export const CHAINS: Record<number, {
    name: string;
    rpc: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    startBlock?: number;
}> = {
    31337: {
        name: 'Anvil (Local)',
        rpc: 'http://127.0.0.1:8545',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    },
    80002: {
        name: 'Polygon Amoy',
        rpc: 'https://polygon-amoy-bor-rpc.publicnode.com',
        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }
    },
    5318007: {
        name: 'Lasna Testnet',
        rpc: 'https://lasna-rpc.rnk.dev/',
        nativeCurrency: { name: 'Lasna React', symbol: 'LREACT', decimals: 18 },
        startBlock: 0
    },
    11155111: {
        name: 'Sepolia Testnet',
        rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        startBlock: 7500000 // Optimized start block for event fetching
    }
};

// Asset types matching the smart contract enum
export enum AssetType {
    ERC20 = 0,
    ERC721 = 1
}

// Tokens per chain
export const TOKENS: Record<number, Array<{
    symbol: string;
    address: string;
    decimals: number;
    assetType: AssetType;
    minutesRatio: number;
}>> = {
    31337: [
        { symbol: 'ETH', address: '0x0000000000000000000000000000000000000000', decimals: 18, assetType: AssetType.ERC20, minutesRatio: 1 },
        { symbol: 'MOCK-NFT', address: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6', decimals: 0, assetType: AssetType.ERC721, minutesRatio: 50 }
    ],
    80002: [
        { symbol: 'POL', address: '0x0000000000000000000000000000000000000000', decimals: 18, assetType: AssetType.ERC20, minutesRatio: 1 },
        { symbol: 'USDC', address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6, assetType: AssetType.ERC20, minutesRatio: 1 },
        { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, assetType: AssetType.ERC20, minutesRatio: 1 },
        { symbol: 'WETH', address: '0x52eF3d68BaB452a294342DC3e5f464d7f610f72E', decimals: 18, assetType: AssetType.ERC20, minutesRatio: 1 },
        { symbol: 'MOCK-NFT', address: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82', decimals: 0, assetType: AssetType.ERC721, minutesRatio: 50 }
    ],
    5318007: [
        { symbol: 'LREACT', address: '0x0000000000000000000000000000000000000000', decimals: 18, assetType: AssetType.ERC20, minutesRatio: 1 },
        // Use consistent NFT address - both users must select this same contract!
        { symbol: 'TEST-NFT', address: '0xe25d9f39f776e6d6ef0689282a9ddfdd1ed00059', decimals: 0, assetType: AssetType.ERC721, minutesRatio: 50 },
        { symbol: 'ALPHADEV', address: '0x87f76f61a2da488694024de34a350dada3f242da', decimals: 0, assetType: AssetType.ERC721, minutesRatio: 50 },
        { symbol: 'FEE-SWAPPER', address: '0xE3023c0305fEdee834A7A553De3BD14042819698', decimals: 0, assetType: AssetType.ERC20, minutesRatio: 0 },
        { symbol: 'TEST', address: '0xba117f0e0722c65690ed26609ad32fc97200f9f8', decimals: 18, assetType: AssetType.ERC20, minutesRatio: 1 },
        { symbol: 'USDC', address: '0x5148c89235d7cf4462f169d6696d1767782f57f0', decimals: 18, assetType: AssetType.ERC20, minutesRatio: 1 }
    ],
    11155111: [
        {
            symbol: 'ETH',
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            assetType: AssetType.ERC20,
            minutesRatio: 1
        },
        {
            symbol: 'TEST',
            address: '0x0384754fe5780cacafcfad6ebd383ae98e496e48',
            decimals: 18,
            assetType: AssetType.ERC20,
            minutesRatio: 1
        },
        {
            symbol: 'USDC',
            address: '0x8ffd65968891879a975bb776a5036af1c10071b0',
            decimals: 18,
            assetType: AssetType.ERC20,
            minutesRatio: 1
        },
        {
            symbol: 'MOCK-NFT',
            address: '0xf21243cfce9ce244e50455a2849013dfcd929797',
            decimals: 0,
            assetType: AssetType.ERC721,
            minutesRatio: 50
        }
    ]
};

// ABIs - Using human-readable format for ethers v6
export const ABIS = {
    FEE_DISTRIBUTOR: [
        'function calculateFee(address token, uint8 assetType, uint256 amount, uint256 minutesValuation) public pure returns (uint256)'
    ],
    WALLET_SWAP_MAIN: [
        'function createOrder(address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 duration, bool enableRebooking, uint256 targetChainId) external payable returns (bytes32)',
        'function fulfillOrder(bytes32 orderId) external payable',
        'function fulfillOrderPartial(bytes32 orderId, uint256 amountToFill) external payable',
        'function matchOrders(bytes32 orderIdA, bytes32 orderIdB) external',
        'function cancelOrder(bytes32 orderId) external',
        'event OrderInitiated(bytes32 indexed orderId, address indexed maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 targetChainId, uint256 timestamp)',
        'event OrderExecuted(bytes32 indexed orderId, address indexed taker, uint256 amountOut, uint256 timestamp)',
        'event OrderAutoMatched(bytes32 indexed orderIdA, bytes32 indexed orderIdB, uint256 timestamp)',
        'event WalletSwapMainInitialized(address indexed owner)'
    ],
    ORDER_PROCESSOR: [
        'function orders(bytes32 orderId) external view returns (address maker, address tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 minutesValueOut, uint256 slippageTolerance, uint256 filledAmount, uint256 timestamp, uint256 expiration, uint8 status, bool rebookEnabled, uint8 rebookAttempts, bytes32 verificationId, uint256 targetChainId)',
        'function cancelOrder(bytes32 orderId) external',
        'function getOrderCount() external view returns (uint256)',
        'event OrderCreated(bytes32 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, uint8 typeIn, uint8 typeOut, uint256 amountIn, uint256 amountOut, uint256 minutesValueIn, uint256 targetChainId, uint256 timestamp)',
        'event OrderCancelled(bytes32 indexed orderId, string reason, uint256 timestamp)',
        'event OrderFilled(bytes32 indexed orderId, uint256 amountOut, uint256 timestamp)'
    ],
    ERC20: [
        'function approve(address spender, uint256 amount) public returns (bool)',
        'function allowance(address owner, address spender) public view returns (uint256)',
        'function balanceOf(address account) public view returns (uint256)',
        'function decimals() public view returns (uint8)'
    ],
    ERC721: [
        'function approve(address to, uint256 tokenId) public',
        'function setApprovalForAll(address operator, bool approved) public',
        'function isApprovedForAll(address owner, address operator) public view returns (bool)',
        'function balanceOf(address owner) public view returns (uint256)',
        'function ownerOf(uint256 tokenId) public view returns (address)',
        'function tokenOfOwnerByIndex(address owner, uint256 index) public view returns (uint256)'
    ],
    ASSET_VERIFIER: [
        'function verifyAsset(bytes32 orderId, address tokenAddress, uint256 tokenId, bytes32 proof) external'
    ]
};
