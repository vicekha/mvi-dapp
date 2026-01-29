import { create } from 'zustand';
import { BrowserProvider, Contract, ethers } from 'ethers';
import { CONTRACTS, ABIS, CHAINS } from '../config/contracts';

interface Web3State {
    provider: BrowserProvider | null;
    signer: ethers.Signer | null;
    address: string | null;
    chainId: number | null;
    balance: string;
    isConnecting: boolean;
    error: string | null;

    connect: () => Promise<void>;
    disconnect: () => void;
    switchChain: (chainId: number) => Promise<void>;
    getContract: <T extends keyof typeof ABIS>(name: T) => Contract | null;
}

export const useWeb3 = create<Web3State>((set, get) => ({
    provider: null,
    signer: null,
    address: null,
    chainId: null,
    balance: '0',
    isConnecting: false,
    error: null,

    connect: async () => {
        // Prevent concurrent connection attempts
        if (get().isConnecting) return;

        if (!window.ethereum) {
            // Check for mobile deep linking or alternative injection
            set({ error: 'Wallet not found. If on mobile, please open this link inside MetaMask app browser.' });
            return;
        }

        set({ isConnecting: true, error: null });

        try {
            const provider = new BrowserProvider(window.ethereum);
            const accounts = await provider.send('eth_requestAccounts', []);
            const signer = await provider.getSigner();
            const network = await provider.getNetwork();

            // Fetch balance with retry logic for RPC stability
            const fetchWithRetry = async (retryCount = 0): Promise<bigint> => {
                try {
                    return await provider.getBalance(accounts[0]);
                } catch (err) {
                    if (retryCount < 3) {
                        const delay = (retryCount + 1) * 1000;
                        await new Promise(r => setTimeout(r, delay));
                        return fetchWithRetry(retryCount + 1);
                    }
                    throw err;
                }
            };

            const balance = await fetchWithRetry();

            set({
                provider,
                signer,
                address: accounts[0],
                chainId: Number(network.chainId),
                balance: ethers.formatEther(balance),
                isConnecting: false
            });

            // Listeners
            window.ethereum.on('accountsChanged', (accs: unknown) => {
                const accounts = accs as string[];
                if (accounts.length === 0) {
                    get().disconnect();
                } else {
                    // Reset to avoid provider/signer mismatch
                    set({ provider: null, signer: null, chainId: null, isConnecting: false });
                    get().connect();
                }
            });

            window.ethereum.on('chainChanged', () => {
                // Reset to avoid Ethers v6 NETWORK_ERROR
                set({ provider: null, signer: null, chainId: null, isConnecting: false });
                get().connect();
            });

        } catch (err: any) {
            console.error('Connection error:', err);
            let errorMessage = (err as Error).message;

            // Handle specific MetaMask "already pending" error
            if (err.code === -32002) {
                errorMessage = 'Connection request already pending. Please check your wallet extension.';
            }

            set({ error: errorMessage, isConnecting: false });
        }
    },

    disconnect: () => {
        set({
            provider: null,
            signer: null,
            address: null,
            chainId: null,
            balance: '0'
        });
    },

    switchChain: async (targetChainId: number) => {
        if (!window.ethereum) return;

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }]
            });
        } catch (err: unknown) {
            const error = err as { code?: number };
            if (error.code === 4902) {
                const chain = CHAINS[targetChainId];
                if (chain) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: `0x${targetChainId.toString(16)}`,
                            chainName: chain.name,
                            rpcUrls: [chain.rpc],
                            nativeCurrency: chain.nativeCurrency
                        }]
                    });
                }
            }
        }
    },

    getContract: (name) => {
        const { signer, chainId, provider } = get();
        if ((!signer && !provider) || !chainId) return null;

        const contracts = CONTRACTS[chainId];
        if (!contracts) return null;

        const address = contracts[name as keyof typeof contracts];
        if (!address) return null;

        // Ensure address is checksummed to prevent ethers v6 from thinking it's an ENS name on unknown networks
        const checksummedAddress = ethers.getAddress(address);

        return new Contract(checksummedAddress, ABIS[name], signer || provider);
    }
}));

declare global {
    interface Window {
        ethereum?: {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
            on: (event: string, callback: (...args: unknown[]) => void) => void;
        };
    }
}
