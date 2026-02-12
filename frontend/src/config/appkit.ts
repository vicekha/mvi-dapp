import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';
import { CHAINS } from './contracts';

// 1. Get projectId from https://cloud.reown.com
export const PROJECT_ID = '203fc7dc02b32d87c08c95ef9f038c00'; // User provided

// 2. Define networks
const networks = Object.entries(CHAINS).map(([id, config]) => ({
    chainId: Number(id),
    name: config.name,
    currency: config.nativeCurrency.symbol,
    explorerUrl: (config as any).explorerUrl || '',
    rpcUrl: config.rpc
}));

// 3. Create a metadata object
const metadata = {
    name: 'MVI DApp',
    description: 'Time-Validated Swaps Powered by Reactive Network',
    url: window.location.origin,
    icons: ['https://avatars.githubusercontent.com/u/37784886']
};

// 4. Create Ethers config
const ethersConfig = defaultConfig({
    metadata,
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: true,
    rpcUrl: CHAINS[11155111].rpc // Default to Sepolia
});

// 5. Create modal
export const web3modal = createWeb3Modal({
    ethersConfig,
    chains: networks,
    projectId: PROJECT_ID,
    enableAnalytics: false,
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#6366f1',
        '--w3m-border-radius-master': '12px'
    }
});
