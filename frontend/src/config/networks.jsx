export const sonicMainnet = {
  chainId: 146,
  name: 'Sonic Mainnet',
  currency: 'S',
  explorerUrl: 'https://sonicscan.org',
  rpcUrl: 'https://rpc.soniclabs.com'
};

export const sonicTestnet = {
  chainId: 14601,
  name: 'Sonic Testnet',
  currency: 'S',
  explorerUrl: 'https://sonic-testnet.sonicscan.org',
  rpcUrl: 'https://rpc.testnet.soniclabs.com'
};

export const lasna = {
  chainId: 5318007,
  name: 'Lasna',
  currency: 'REACT',
  explorerUrl: 'https://lasna-explorer.rnk.dev',
  rpcUrl: 'https://lasna-rpc.rnk.dev/'
};

export const sepolia = {
  chainId: 11155111,
  name: 'Sepolia',
  currency: 'ETH',
  explorerUrl: 'https://sepolia.etherscan.io',
  rpcUrl: 'https://rpc.ankr.com/eth_sepolia'
};

export const baseSepolia = {
  chainId: 84532,
  name: 'Base Sepolia',
  currency: 'ETH',
  explorerUrl: 'https://sepolia.basescan.org',
  rpcUrl: 'https://rpc.ankr.com/base_sepolia'
};

export const coston = {
  chainId: 114,
  name: 'Coston',
  currency: 'FLR',
  explorerUrl: 'https://coston-explorer.flare.network',
  rpcUrl: 'https://coston-api.flare.network/ext/bc/C/rpc'
};

export const coston2 = {
  chainId: 1597,
  name: 'Coston2',
  currency: 'FLR',
  explorerUrl: 'https://coston2-explorer.flare.network',
  rpcUrl: 'https://coston2-api.flare.network/ext/bc/C/rpc'
};

export const WEB3_CHAINS = [sonicMainnet, sonicTestnet, lasna, sepolia, baseSepolia, coston, coston2];

export const NETWORKS = [
  { id: 146, name: 'Sonic Mainnet', icon: 'sonic', color: '#B300FF', chainIdHex: '0x92', rpcUrl: sonicMainnet.rpcUrl, currency: 'S' },
  { id: 14601, name: 'Sonic Testnet', icon: 'sonic', color: '#B300FF', chainIdHex: '0x3909', rpcUrl: sonicTestnet.rpcUrl, currency: 'S' },
  { id: 5318007, name: 'Lasna', icon: 'lasna', color: '#00B3FF', chainIdHex: '0x512577', rpcUrl: lasna.rpcUrl, currency: 'REACT' },
  { id: 11155111, name: 'Sepolia', icon: 'eth', color: '#627EEA', chainIdHex: '0xaa36a7', rpcUrl: sepolia.rpcUrl, currency: 'ETH' },
  { id: 84532, name: 'Base Sepolia', icon: 'base', color: '#0052FF', chainIdHex: '0x14a34', rpcUrl: baseSepolia.rpcUrl, currency: 'ETH' },
  { id: 114, name: 'Coston', icon: 'flare', color: '#E12D3A', chainIdHex: '0x72', rpcUrl: coston.rpcUrl, currency: 'FLR' },
  { id: 1597, name: 'Coston2', icon: 'flare', color: '#E12D3A', chainIdHex: '0x63d', rpcUrl: coston2.rpcUrl, currency: 'FLR' }
];

export const CHAIN_ICONS = {
  sonic: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#B300FF" fillOpacity="0.15"/>
      <path d="M6 14l3-5h5l-3 5H6z" fill="#B300FF"/>
      <path d="M8 6l3 5H6l3-5z" fill="#D066FF"/>
    </svg>
  ),
  lasna: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#00B3FF" fillOpacity="0.15"/>
      <circle cx="10" cy="10" r="5" stroke="#00B3FF" strokeWidth="1.5" fill="none"/>
      <circle cx="10" cy="10" r="2" fill="#00B3FF"/>
    </svg>
  ),
  eth: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#627EEA" fillOpacity="0.15"/>
      <path d="M10 3l-5 7 5 3 5-3-5-7z" fill="#627EEA"/>
      <path d="M5 10l5 7 5-7-5 3-5-3z" fill="#627EEA" fillOpacity="0.6"/>
    </svg>
  ),
  base: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#0052FF" fillOpacity="0.15"/>
      <circle cx="10" cy="10" r="5" fill="#0052FF"/>
      <path d="M8 10a2 2 0 104 0 2 2 0 00-4 0z" fill="#fff"/>
    </svg>
  ),
  flare: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#E12D3A" fillOpacity="0.15"/>
      <path d="M10 4l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" fill="#E12D3A"/>
    </svg>
  )
};
