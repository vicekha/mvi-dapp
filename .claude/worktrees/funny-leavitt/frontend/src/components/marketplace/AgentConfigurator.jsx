import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, X, Rocket, Bot, Info, Loader2, Wallet } from 'lucide-react';
import { STRATEGIES } from '../../engine/agentPersonalities.js';
import { computeBaseRate } from '../../config/planbok.js';
import TOKEN_LIST from '../../tokenlist.json';

function TokenPicker({ label, token, onSelect, chainId, exclude }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const tokens = useMemo(() =>
    TOKEN_LIST.tokens
      .filter(t => t.chainId === chainId)
      .filter(t => !exclude || t.address !== exclude.address)
      .filter(t => !search || t.symbol.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase())),
    [chainId, search, exclude]
  );

  return (
    <div className="mp-token-picker" ref={ref}>
      <label className="mp-label">{label}</label>
      <button className="mp-token-btn" onClick={() => setOpen(!open)}>
        {token ? (
          <>
            <span className="mp-token-sym">{token.symbol}</span>
            <span className="mp-token-name">{token.name}</span>
          </>
        ) : (
          <span className="mp-token-placeholder">Select Token</span>
        )}
        <ChevronDown size={14} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="mp-token-dropdown" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="mp-token-search">
              <Search size={14} />
              <input placeholder="Search tokens..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
            <div className="mp-token-list">
              {tokens.map(t => (
                <button key={`${t.chainId}-${t.address}`} className="mp-token-option" onClick={() => { onSelect(t); setOpen(false); setSearch(''); }}>
                  <span className="mp-token-sym">{t.symbol}</span>
                  <span className="mp-token-name">{t.name}</span>
                  {t.basePrice > 0 && <span className="mp-token-price">${t.basePrice}</span>}
                </button>
              ))}
              {tokens.length === 0 && <div className="mp-token-empty">No tokens found</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AgentConfigurator({ onDeploy, activeNetwork, targetNetwork, deploying }) {
  const [sellToken, setSellToken] = useState(null);
  const [buyToken, setBuyToken] = useState(null);
  const [sellAmount, setSellAmount] = useState('');
  const [strategy, setStrategy] = useState('moderate');
  const [maxRounds, setMaxRounds] = useState(10);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [fundAmount, setFundAmount] = useState('');

  // Auto-suggest price range when both tokens selected
  useEffect(() => {
    if (sellToken && buyToken) {
      const rate = computeBaseRate(sellToken, buyToken);
      const spread = 0.15;
      setPriceMin((rate * (1 - spread)).toFixed(6));
      setPriceMax((rate * (1 + spread)).toFixed(6));
    }
  }, [sellToken, buyToken]);

  // Auto-set fund amount when sell amount changes
  useEffect(() => {
    if (sellAmount) setFundAmount(sellAmount);
  }, [sellAmount]);

  const canDeploy = sellToken && buyToken && sellAmount && priceMin && priceMax && !deploying;

  const handleDeploy = () => {
    if (!canDeploy) return;
    onDeploy({
      sellToken, buyToken,
      sellAmount,
      priceMin, priceMax,
      strategy,
      maxRounds,
      fundAmount: fundAmount ? parseFloat(fundAmount) : null,
    });
  };

  return (
    <div className="agent-configurator">
      <div className="mp-section-header">
        <Bot size={18} />
        <span>Configure Your Agent</span>
      </div>

      <TokenPicker
        label="Sell Token"
        token={sellToken}
        onSelect={setSellToken}
        chainId={activeNetwork.id}
        exclude={buyToken}
      />

      <div className="mp-field">
        <label className="mp-label">Sell Amount</label>
        <input
          type="number"
          className="mp-input"
          placeholder="0.0"
          value={sellAmount}
          onChange={e => setSellAmount(e.target.value)}
          min="0"
          step="any"
        />
      </div>

      <TokenPicker
        label="Buy Token"
        token={buyToken}
        onSelect={setBuyToken}
        chainId={targetNetwork.id}
        exclude={sellToken}
      />

      <div className="mp-price-range">
        <label className="mp-label">
          Acceptable Price Range
          <span className="mp-label-sub">({buyToken?.symbol || '?'} per {sellToken?.symbol || '?'})</span>
        </label>
        <div className="mp-price-inputs">
          <input type="number" className="mp-input small" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value)} step="any" />
          <span className="mp-price-sep">—</span>
          <input type="number" className="mp-input small" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value)} step="any" />
        </div>
      </div>

      <div className="mp-field">
        <label className="mp-label">Agent Strategy</label>
        <div className="mp-strategy-grid">
          {Object.values(STRATEGIES).map(s => (
            <button
              key={s.id}
              className={`mp-strategy-card ${strategy === s.id ? 'active' : ''}`}
              onClick={() => setStrategy(s.id)}
              style={{ '--strat-color': s.color }}
            >
              <span className="mp-strategy-name">{s.name}</span>
              <span className="mp-strategy-desc">{s.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mp-field">
        <label className="mp-label">Max Negotiation Rounds: {maxRounds}</label>
        <input
          type="range"
          className="mp-slider"
          min="5"
          max="20"
          value={maxRounds}
          onChange={e => setMaxRounds(parseInt(e.target.value))}
        />
        <div className="mp-slider-labels">
          <span>5</span>
          <span>Quick</span>
          <span>Extended</span>
          <span>20</span>
        </div>
      </div>

      <div className="mp-field">
        <label className="mp-label">
          <Wallet size={13} /> Fund Agent Wallet
          <span className="mp-label-sub">(amount of {sellToken?.symbol || 'tokens'} to send to MPC wallet)</span>
        </label>
        <input
          type="number"
          className="mp-input"
          placeholder="0.0"
          value={fundAmount}
          onChange={e => setFundAmount(e.target.value)}
          min="0"
          step="any"
        />
      </div>

      <button className="mp-deploy-btn" onClick={handleDeploy} disabled={!canDeploy}>
        {deploying ? <Loader2 size={16} className="spin" /> : <Rocket size={16} />}
        {deploying ? 'Creating Agent...' : 'Deploy AI Agent'}
      </button>

      <div className="mp-info-box">
        <Info size={13} />
        <span>Your AI agent uses Claude to negotiate prices autonomously. A Planbok MPC wallet is created for secure on-chain settlement via AutoSwap.</span>
      </div>
    </div>
  );
}
