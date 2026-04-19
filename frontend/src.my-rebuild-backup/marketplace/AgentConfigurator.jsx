import React, { useMemo, useState } from 'react';
import { Rocket, Loader2, Coins, ArrowDownUp } from 'lucide-react';

// Quick-pick strategy presets so users don't have to write a persona from scratch.
const STRATEGY_PRESETS = [
  { label: 'Aggressive bull', text: 'You are an aggressive momentum trader. Open high, concede slowly, never break below your floor.' },
  { label: 'Pragmatic hedger', text: 'You are a risk-averse hedger. You prefer closing trades quickly at fair mid-market prices. Concede readily.' },
  { label: 'Patient whale', text: 'You are a patient whale. Only accept favorable prices. Walk away rather than take a bad deal.' },
  { label: 'Opportunistic scalper', text: 'You are a fast-turnover scalper. Aim for thin margins but high volume. Quick concessions to close.' },
];

/**
 * AgentConfigurator — form that POSTs to the agent-server to create a new agent.
 * After creation, the agent appears in the arena and auto-matchmaker picks it up.
 */
export default function AgentConfigurator({ tokens, connectedAddress, onCreated }) {
  const sellable = useMemo(() => tokens.filter((t) => t.address && t.address !== '0x0000000000000000000000000000000000000000'), [tokens]);
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState(STRATEGY_PRESETS[0].text);
  const [sellTokenAddr, setSellTokenAddr] = useState(sellable[0]?.address || '');
  const [buyTokenAddr, setBuyTokenAddr] = useState(sellable[1]?.address || '');
  const [sellAmount, setSellAmount] = useState('10');
  const [priceMin, setPriceMin] = useState('0.98');
  const [priceMax, setPriceMax] = useState('1.02');
  const [maxRounds, setMaxRounds] = useState(8);
  const [fundFromMaster, setFundFromMaster] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const sellToken = sellable.find((t) => t.address === sellTokenAddr);
  const buyToken  = sellable.find((t) => t.address === buyTokenAddr);

  const canSubmit = name && sellToken && buyToken && sellToken.address !== buyToken.address
    && Number(sellAmount) > 0 && Number(priceMin) > 0 && Number(priceMax) >= Number(priceMin);

  async function handleSubmit(e) {
    e?.preventDefault?.();
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const agent = await onCreated({
        name,
        strategy,
        sellToken: { address: sellToken.address, symbol: sellToken.symbol, decimals: sellToken.decimals },
        buyToken:  { address: buyToken.address,  symbol: buyToken.symbol,  decimals: buyToken.decimals },
        sellAmount: String(sellAmount),
        priceMin: Number(priceMin),
        priceMax: Number(priceMax),
        maxRounds: Number(maxRounds),
        fundFromMaster,
        ownerAddress: connectedAddress || null,
      });
      if (agent) {
        setName('');
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function swapPair() {
    setSellTokenAddr(buyTokenAddr);
    setBuyTokenAddr(sellTokenAddr);
  }

  return (
    <form className="mp-config" onSubmit={handleSubmit}>
      <div className="mp-config-title">
        <Rocket size={18} />
        <span>Deploy a new trading agent</span>
      </div>

      <label className="mp-field">
        <span>Agent name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Orion-7"
          maxLength={32}
        />
      </label>

      <label className="mp-field">
        <span>Strategy / persona</span>
        <div className="mp-preset-row">
          {STRATEGY_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`mp-preset ${strategy === p.text ? 'active' : ''}`}
              onClick={() => setStrategy(p.text)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          rows={3}
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          placeholder="Describe how this agent should negotiate..."
        />
      </label>

      <div className="mp-pair">
        <label className="mp-field mp-field-half">
          <span>Sell</span>
          <select value={sellTokenAddr} onChange={(e) => setSellTokenAddr(e.target.value)}>
            {sellable.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol} — {t.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className="mp-pair-swap" onClick={swapPair} title="Swap direction">
          <ArrowDownUp size={16} />
        </button>
        <label className="mp-field mp-field-half">
          <span>For</span>
          <select value={buyTokenAddr} onChange={(e) => setBuyTokenAddr(e.target.value)}>
            {sellable.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol} — {t.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="mp-field">
        <span>Amount to sell ({sellToken?.symbol || '—'})</span>
        <input
          type="number"
          step="any"
          value={sellAmount}
          onChange={(e) => setSellAmount(e.target.value)}
          min="0"
        />
      </label>

      <div className="mp-pair">
        <label className="mp-field mp-field-half">
          <span>Min price ({buyToken?.symbol || '—'} per {sellToken?.symbol || '—'})</span>
          <input type="number" step="any" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
        </label>
        <label className="mp-field mp-field-half">
          <span>Max price</span>
          <input type="number" step="any" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
        </label>
      </div>

      <label className="mp-field">
        <span>Max negotiation rounds</span>
        <input type="number" min="2" max="20" value={maxRounds} onChange={(e) => setMaxRounds(e.target.value)} />
      </label>

      <label className="mp-field mp-field-inline">
        <input type="checkbox" checked={fundFromMaster} onChange={(e) => setFundFromMaster(e.target.checked)} />
        <Coins size={14} />
        <span>Fund agent wallet from server master (gas + {sellToken?.symbol || 'token'})</span>
      </label>

      {error && <div className="mp-error">{error}</div>}

      <button className="mp-deploy-btn" type="submit" disabled={!canSubmit || submitting}>
        {submitting ? <Loader2 size={16} className="mp-spin" /> : <Rocket size={16} />}
        <span>{submitting ? 'Deploying...' : 'Deploy AI Agent'}</span>
      </button>
    </form>
  );
}
