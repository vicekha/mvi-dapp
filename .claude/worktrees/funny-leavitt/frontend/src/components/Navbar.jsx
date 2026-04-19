import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Wallet, ChevronDown } from 'lucide-react';
import { useWeb3Modal, useWeb3ModalAccount } from '@web3modal/ethers/react';
import { NETWORKS, CHAIN_ICONS } from '../config/networks.jsx';

export default function Navbar() {
  const { open } = useWeb3Modal();
  const { address, chainId, isConnected } = useWeb3ModalAccount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const currentNetwork = NETWORKS.find(n => BigInt(n.id) === BigInt(chainId || 146));
  const isLanding = location.pathname === '/';

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="navbar-brand">
            <div className="brand-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#g1)" />
                <path d="M2 17l10 5 10-5" stroke="url(#g2)" strokeWidth="2" fill="none" />
                <path d="M2 12l10 5 10-5" stroke="url(#g2)" strokeWidth="2" fill="none" />
                <defs>
                  <linearGradient id="g1" x1="2" y1="2" x2="22" y2="12">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#a855f7" />
                  </linearGradient>
                  <linearGradient id="g2" x1="2" y1="12" x2="22" y2="22">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="brand-text">AutoSwap</span>
          </Link>

          <div className="navbar-links">
            <Link to="/" className={`nav-link ${isLanding ? 'active' : ''}`}>Home</Link>
            <Link to="/swap" className={`nav-link ${location.pathname === '/swap' ? 'active' : ''}`}>Swap</Link>
            <Link to="/marketplace" className={`nav-link ${location.pathname === '/marketplace' ? 'active' : ''}`}>Marketplace</Link>
            <a href="https://docs.reactive.network" target="_blank" rel="noopener noreferrer" className="nav-link">Docs</a>
          </div>

          <div className="navbar-actions">
            {isConnected && currentNetwork && (
              <button className="chain-pill" onClick={() => open({ view: 'Networks' })}>
                <span className="chain-icon">{CHAIN_ICONS[currentNetwork.icon]}</span>
                <span className="chain-name">{currentNetwork.name}</span>
                <ChevronDown size={14} />
              </button>
            )}

            <button
              className="connect-btn"
              onClick={() => open()}
            >
              <Wallet size={16} />
              <span>
                {isConnected
                  ? `${address.slice(0, 6)}...${address.slice(-4)}`
                  : 'Connect Wallet'}
              </span>
            </button>

            <button className="mobile-toggle" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="mobile-nav"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Link to="/" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>Home</Link>
            <Link to="/swap" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>Swap</Link>
            <Link to="/marketplace" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>Marketplace</Link>
            <a href="https://docs.reactive.network" target="_blank" rel="noopener noreferrer" className="mobile-nav-link">Docs</a>
            {isConnected && currentNetwork && (
              <button className="chain-pill mobile-chain" onClick={() => { open({ view: 'Networks' }); setMobileOpen(false); }}>
                <span className="chain-icon">{CHAIN_ICONS[currentNetwork.icon]}</span>
                <span>{currentNetwork.name}</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
