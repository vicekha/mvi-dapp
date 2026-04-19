import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import { WEB3_CHAINS, sonicMainnet } from './networks.jsx';

const projectId = '203fc7dc02b32d87c08c95ef9f038c00';

const metadata = {
  name: 'AutoSwap',
  description: 'Intent-Based Cross-Chain Swap Protocol',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://autoswap.pages.dev',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};

const ethersConfig = defaultConfig({
  metadata,
  enableEIP6963: true,
  enableInjected: true,
  enableCoinbase: true,
  rpcUrl: sonicMainnet.rpcUrl
});

createWeb3Modal({
  ethersConfig,
  chains: WEB3_CHAINS,
  projectId,
  enableAnalytics: true,
  allWallets: 'SHOW',
  enableOnramp: true
});
