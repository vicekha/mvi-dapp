import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight, Zap, Shield, Layers, Globe, RefreshCcw,
  TrendingUp, Lock, Clock, Target, Cpu, ArrowDownUp,
  ChevronRight, CheckCircle2
} from 'lucide-react';
import { NETWORKS, CHAIN_ICONS } from '../config/networks.jsx';

function AnimatedSection({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatCard({ value, label, icon: Icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}15`, color }}>
        <Icon size={22} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, color, index }) {
  return (
    <AnimatedSection delay={index * 0.1}>
      <div className="feature-card">
        <div className="feature-icon-wrap" style={{ background: `${color}12`, borderColor: `${color}30` }}>
          <Icon size={24} style={{ color }} />
        </div>
        <h3 className="feature-title">{title}</h3>
        <p className="feature-desc">{description}</p>
      </div>
    </AnimatedSection>
  );
}

function HowItWorksStep({ step, title, description, icon: Icon, isLast }) {
  return (
    <div className="step-item">
      <div className="step-connector">
        <div className="step-number">{step}</div>
        {!isLast && <div className="step-line" />}
      </div>
      <div className="step-content">
        <div className="step-icon-mini">
          <Icon size={18} />
        </div>
        <h4 className="step-title">{title}</h4>
        <p className="step-desc">{description}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const features = [
    {
      icon: Target,
      title: 'Intent-Based Swaps',
      description: 'Specify exactly what you want. No slippage surprises. Your intent is matched at your price or better by the protocol.',
      color: '#6366f1'
    },
    {
      icon: Globe,
      title: 'Cross-Chain Native',
      description: 'Swap assets across Sonic, Ethereum, Base, Flare and more. Reactive Network coordinates matches across all chains automatically.',
      color: '#00B3FF'
    },
    {
      icon: Zap,
      title: 'Instant Auto-Matching',
      description: 'Orders are matched the moment a compatible counterparty exists. No waiting, no manual execution needed.',
      color: '#f59e0b'
    },
    {
      icon: Shield,
      title: 'MEV Protected',
      description: 'Intent-based architecture eliminates front-running and sandwich attacks. Your trades execute at the price you set.',
      color: '#10b981'
    },
    {
      icon: Layers,
      title: 'Partial Fills',
      description: 'Large orders fill progressively across multiple counterparties. Watch your order complete in real-time with live progress tracking.',
      color: '#a855f7'
    },
    {
      icon: RefreshCcw,
      title: 'Auto-Rebooking',
      description: 'Expired orders with low fill rates are automatically rebooked. Set it and forget it - the protocol works for you.',
      color: '#ec4899'
    }
  ];

  const steps = [
    {
      icon: ArrowDownUp,
      title: 'Create Your Intent',
      description: 'Select the tokens you want to swap, set your desired amounts, and choose your target chain. The protocol handles the rest.'
    },
    {
      icon: Cpu,
      title: 'Reactive Network Monitors',
      description: 'Your order is broadcast to the Reactive Network, where the R-EVM monitors all registered chains for matching counterparties.'
    },
    {
      icon: Zap,
      title: 'Auto-Match & Execute',
      description: 'When a match is found, the protocol executes the swap atomically. Both parties receive their tokens with zero manual intervention.'
    },
    {
      icon: CheckCircle2,
      title: 'Settlement Complete',
      description: 'Tokens arrive in your wallet. Cross-chain callbacks confirm execution on both sides. Full transparency via on-chain events.'
    }
  ];

  const comparisons = [
    { feature: 'Front-running protection', autoswap: true, traditional: false },
    { feature: 'Cross-chain native', autoswap: true, traditional: false },
    { feature: 'No impermanent loss', autoswap: true, traditional: false },
    { feature: 'Exact price execution', autoswap: true, traditional: false },
    { feature: 'Partial fill support', autoswap: true, traditional: false },
    { feature: 'Automatic order matching', autoswap: true, traditional: false },
    { feature: 'No liquidity pool needed', autoswap: true, traditional: false },
  ];

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
          <div className="hero-orb hero-orb-3" />
          <div className="hero-grid" />
        </div>

        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero-badge">
            <Zap size={14} />
            <span>Powered by Reactive Network</span>
          </div>

          <h1 className="hero-title">
            The Future of
            <br />
            <span className="hero-gradient">Cross-Chain Swaps</span>
          </h1>

          <p className="hero-subtitle">
            AutoSwap is an intent-based, peer-to-peer protocol that automatically matches
            and executes swaps across multiple blockchains. No AMMs. No slippage. No MEV.
          </p>

          <div className="hero-actions">
            <Link to="/swap" className="hero-cta-primary">
              <span>Launch App</span>
              <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="hero-cta-secondary">
              <span>How It Works</span>
              <ChevronRight size={18} />
            </a>
          </div>

          <div className="hero-stats">
            <StatCard value="7" label="Chains Supported" icon={Globe} color="#6366f1" />
            <StatCard value="0.05%" label="Swap Fee" icon={TrendingUp} color="#10b981" />
            <StatCard value="< 3s" label="Match Time" icon={Clock} color="#f59e0b" />
            <StatCard value="100%" label="MEV Protected" icon={Shield} color="#ec4899" />
          </div>
        </motion.div>

        {/* Animated swap preview */}
        <motion.div
          className="hero-visual"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="swap-preview-card">
            <div className="preview-header">
              <span className="preview-dot green" />
              <span className="preview-label">Live Preview</span>
            </div>
            <div className="preview-row">
              <div className="preview-token">
                <div className="preview-token-icon" style={{ background: '#627EEA20', color: '#627EEA' }}>ETH</div>
                <div>
                  <div className="preview-token-amount">1.5</div>
                  <div className="preview-token-name">Ethereum</div>
                </div>
              </div>
              <div className="preview-chain-badge">Sepolia</div>
            </div>
            <div className="preview-arrow">
              <div className="preview-arrow-line" />
              <div className="preview-arrow-icon">
                <ArrowDownUp size={16} />
              </div>
              <div className="preview-arrow-line" />
            </div>
            <div className="preview-row">
              <div className="preview-token">
                <div className="preview-token-icon" style={{ background: '#B300FF20', color: '#B300FF' }}>S</div>
                <div>
                  <div className="preview-token-amount">5,250</div>
                  <div className="preview-token-name">Sonic</div>
                </div>
              </div>
              <div className="preview-chain-badge sonic">Sonic</div>
            </div>
            <div className="preview-status">
              <div className="preview-status-dot pulse" />
              <span>Auto-matching in progress...</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Supported Chains */}
      <section className="chains-section">
        <AnimatedSection>
          <div className="section-label">Ecosystem</div>
          <h2 className="section-title">Trade Across Chains</h2>
          <p className="section-subtitle">One protocol, multiple blockchains. Swap assets seamlessly between any supported network.</p>
        </AnimatedSection>
        <div className="chains-grid">
          {NETWORKS.map((network, i) => (
            <AnimatedSection key={network.id} delay={i * 0.05}>
              <div className="chain-card" style={{ '--chain-color': network.color }}>
                <div className="chain-card-icon">{CHAIN_ICONS[network.icon]}</div>
                <div className="chain-card-name">{network.name}</div>
                <div className="chain-card-currency">{network.currency}</div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="features-section">
        <AnimatedSection>
          <div className="section-label">Features</div>
          <h2 className="section-title">Why AutoSwap?</h2>
          <p className="section-subtitle">
            A fundamentally different approach to token swaps. Intent-based architecture
            solves the problems that traditional AMMs and order books can't.
          </p>
        </AnimatedSection>
        <div className="features-grid">
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} index={i} />
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="how-section" id="how-it-works">
        <AnimatedSection>
          <div className="section-label">Process</div>
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">
            Four simple steps from intent to settlement. The protocol handles all the complexity.
          </p>
        </AnimatedSection>

        <div className="how-layout">
          <div className="steps-list">
            {steps.map((s, i) => (
              <AnimatedSection key={i} delay={i * 0.15}>
                <HowItWorksStep
                  step={i + 1}
                  {...s}
                  isLast={i === steps.length - 1}
                />
              </AnimatedSection>
            ))}
          </div>

          <AnimatedSection delay={0.2}>
            <div className="how-diagram">
              <div className="diagram-card">
                <div className="diagram-title">Architecture Overview</div>
                <div className="diagram-flow">
                  <div className="diagram-node origin">
                    <div className="diagram-node-label">Origin Chain</div>
                    <div className="diagram-node-sub">User creates intent</div>
                  </div>
                  <div className="diagram-arrow-down">
                    <svg width="24" height="40" viewBox="0 0 24 40">
                      <path d="M12 0v32M6 26l6 8 6-8" stroke="#6366f1" strokeWidth="2" fill="none" />
                    </svg>
                  </div>
                  <div className="diagram-node reactive">
                    <div className="diagram-node-label">Reactive Network</div>
                    <div className="diagram-node-sub">R-EVM matches orders</div>
                  </div>
                  <div className="diagram-arrow-split">
                    <svg width="200" height="40" viewBox="0 0 200 40">
                      <path d="M100 0v16M100 16L30 32M100 16L170 32" stroke="#a855f7" strokeWidth="2" fill="none" />
                      <path d="M24 26l6 8 6-8" stroke="#a855f7" strokeWidth="2" fill="none" />
                      <path d="M164 26l6 8 6-8" stroke="#a855f7" strokeWidth="2" fill="none" />
                    </svg>
                  </div>
                  <div className="diagram-targets">
                    <div className="diagram-node target">
                      <div className="diagram-node-label">Chain A</div>
                      <div className="diagram-node-sub">Execute callback</div>
                    </div>
                    <div className="diagram-node target">
                      <div className="diagram-node-label">Chain B</div>
                      <div className="diagram-node-sub">Execute callback</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Comparison */}
      <section className="compare-section">
        <AnimatedSection>
          <div className="section-label">Comparison</div>
          <h2 className="section-title">AutoSwap vs Traditional DEXs</h2>
          <p className="section-subtitle">See how intent-based swaps compare to AMM-based exchanges.</p>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>
                    <div className="compare-header-brand">
                      <Target size={16} />
                      AutoSwap
                    </div>
                  </th>
                  <th>Traditional DEX</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((c, i) => (
                  <tr key={i}>
                    <td>{c.feature}</td>
                    <td>
                      <span className="compare-check yes">
                        <CheckCircle2 size={16} />
                      </span>
                    </td>
                    <td>
                      <span className="compare-check no">
                        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="2"/></svg>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnimatedSection>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <AnimatedSection>
          <div className="cta-card">
            <div className="cta-bg">
              <div className="cta-orb cta-orb-1" />
              <div className="cta-orb cta-orb-2" />
            </div>
            <h2 className="cta-title">Ready to Swap Smarter?</h2>
            <p className="cta-subtitle">
              Join the intent-based revolution. Create your first cross-chain swap in under 30 seconds.
            </p>
            <Link to="/swap" className="hero-cta-primary">
              <span>Start Swapping</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="url(#fg1)" />
                <path d="M2 17l10 5 10-5" stroke="url(#fg2)" strokeWidth="2" fill="none" />
                <path d="M2 12l10 5 10-5" stroke="url(#fg2)" strokeWidth="2" fill="none" />
                <defs>
                  <linearGradient id="fg1" x1="2" y1="2" x2="22" y2="12"><stop stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" /></linearGradient>
                  <linearGradient id="fg2" x1="2" y1="12" x2="22" y2="22"><stop stopColor="#6366f1" /><stop offset="1" stopColor="#ec4899" /></linearGradient>
                </defs>
              </svg>
            </div>
            <span>AutoSwap Protocol</span>
          </div>
          <div className="footer-links">
            <a href="https://docs.reactive.network" target="_blank" rel="noopener noreferrer">Docs</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <div className="footer-copy">Built on Reactive Network</div>
        </div>
      </footer>
    </div>
  );
}
