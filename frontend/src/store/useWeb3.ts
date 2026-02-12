import { create } from 'zustand';
import { BrowserProvider, Contract, ethers } from 'ethers';
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider, useWeb3ModalState } from '@web3modal/ethers/react';
import { CONTRACTS, ABIS } from '../config/contracts';
import { useEffect } from 'react';

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
        console.warn('Store-level connect call. Use useWeb3Sync().open() in components instead.');
    },

    disconnect: async () => {
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
            await (window.ethereum as any).request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${targetChainId.toString(16)}` }]
            });
        } catch (err) {
            console.error('Switch chain error', err);
        }
    },

    getContract: (name) => {
        const { signer, chainId, provider } = get();
        if ((!signer && !provider) || !chainId) return null;

        const contracts = CONTRACTS[chainId];
        if (!contracts) return null;

        const address = contracts[name as keyof typeof contracts];
        if (!address) return null;

        const checksummedAddress = ethers.getAddress(address);
        return new Contract(checksummedAddress, ABIS[name], signer || provider);
    }
}));

// A hook to sync AppKit state with our Zustand store
export const useWeb3Sync = () => {
    const { address, chainId, isConnected } = useWeb3ModalAccount();
    const { walletProvider } = useWeb3ModalProvider();
    const { open: modalOpen } = useWeb3ModalState();
    const { open } = useWeb3Modal();

    // Track isConnecting based on Modal state or account state
    useEffect(() => {
        if (modalOpen && !isConnected) {
            useWeb3.setState({ isConnecting: true });
        } else if (!modalOpen && !isConnected) {
            useWeb3.setState({ isConnecting: false });
        }
    }, [modalOpen, isConnected]);

    useEffect(() => {
        console.log('useWeb3Sync State:', { isConnected, hasProvider: !!walletProvider, address, chainId });

        if (isConnected && walletProvider && address && chainId) {
            const sync = async () => {
                try {
                    console.log('Starting Web3 Sync...');
                    const provider = new BrowserProvider(walletProvider);

                    // Add timeout for balance to prevent hangs
                    const balancePromise = provider.getBalance(address);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Balance fetch timeout')), 5000)
                    );

                    const balance = await Promise.race([balancePromise, timeoutPromise]) as bigint;
                    const signer = await provider.getSigner();

                    console.log('Web3 Sync Complete:', { address, balance: ethers.formatEther(balance) });

                    useWeb3.setState({
                        address,
                        chainId,
                        provider,
                        signer,
                        balance: ethers.formatEther(balance),
                        isConnecting: false,
                        error: null
                    });
                } catch (err: any) {
                    console.error('Web3 Sync Error:', err);
                    useWeb3.setState({
                        isConnecting: false,
                        error: `Connection error: ${err.message}`
                    });
                }
            };
            sync();
        } else if (!isConnected) {
            useWeb3.setState({
                address: null,
                chainId: null,
                provider: null,
                signer: null,
                balance: '0',
                isConnecting: false
            });
        }
    }, [isConnected, walletProvider, address, chainId]);

    return { open };
};

declare global {
    interface Window {
        ethereum?: Record<string, unknown>;
    }
}
