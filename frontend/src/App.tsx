import { Toaster } from 'sonner';
import Header from './components/Header';
import SwapPanel from './components/SwapPanel';
import OrdersPanel from './components/OrdersPanel';
import TrendingBanner from './components/TrendingBanner';
import { useWeb3, useWeb3Sync } from './store/useWeb3';

export default function App() {
    useWeb3Sync();
    const { address } = useWeb3();

    return (
        <div className="container">
            <Toaster position="top-center" theme="dark" />
            <TrendingBanner />
            <Header />

            <main style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
                {!address ? (
                    <div style={{ textAlign: 'center', marginTop: '4rem' }}>
                        <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Reactive Exchange
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', marginBottom: '1rem', maxWidth: '600px', margin: '0 auto 1rem' }}>
                            A non-custodial peer-to-peer exchange of tokens and NFTs powered by the Reactive Network.
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '500px', margin: '0 auto' }}>
                            Connect your wallet using the button in the header to get started.
                        </p>
                    </div>
                ) : (
                    <>
                        <SwapPanel />
                        <OrdersPanel />
                    </>
                )}
            </main>

            <footer style={{
                marginTop: '4rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
                padding: '2rem'
            }}>
                <p>© 2026 MVI DApp. Powered by Reactive Network.</p>
                <p style={{ marginTop: '0.5rem' }}>
                    <a href="https://master.mvi-autoswap.pages.dev" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none' }}>
                        master.mvi-autoswap.pages.dev
                    </a>
                </p>
            </footer>
        </div>
    );
}
