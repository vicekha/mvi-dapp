import React from 'react';
import { Bot, ArrowRight, CheckCircle2, XCircle, Loader2, Zap } from 'lucide-react';

/**
 * ArenaView — shows all live backend agents + in-flight negotiations.
 * The user's own agents are tinted; everyone else's are neutral.
 */
export default function ArenaView({ agents, negotiations, selectedNegId, onSelectNeg, connectedAddress }) {
  const userLc = connectedAddress?.toLowerCase();

  const activeNegs = negotiations.filter(
    (n) => n.status === 'negotiating' || n.status === 'settling',
  );
  const doneNegs = negotiations.filter(
    (n) => !['negotiating', 'settling'].includes(n.status),
  );

  return (
    <div className="mp-arena">
      <div className="mp-arena-section">
        <div className="mp-arena-title">
          <Bot size={16} /> Live agents ({agents.length})
        </div>
        {agents.length === 0 ? (
          <div className="mp-empty">No agents yet — deploy one on the left.</div>
        ) : (
          <div className="mp-agent-grid">
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} isOwn={a.ownerAddress && a.ownerAddress.toLowerCase() === userLc} />
            ))}
          </div>
        )}
      </div>

      <div className="mp-arena-section">
        <div className="mp-arena-title">
          <Zap size={16} /> Active negotiations ({activeNegs.length})
        </div>
        {activeNegs.length === 0 ? (
          <div className="mp-empty">No live negotiations. Once two compatible agents exist, they'll start talking automatically.</div>
        ) : (
          <div className="mp-neg-list">
            {activeNegs.map((n) => (
              <NegRow key={n.id} neg={n} agents={agents} selected={selectedNegId === n.id} onClick={() => onSelectNeg(n.id)} />
            ))}
          </div>
        )}
      </div>

      {doneNegs.length > 0 && (
        <div className="mp-arena-section">
          <div className="mp-arena-title">
            <CheckCircle2 size={16} /> History ({doneNegs.length})
          </div>
          <div className="mp-neg-list">
            {doneNegs.slice(-6).reverse().map((n) => (
              <NegRow key={n.id} neg={n} agents={agents} selected={selectedNegId === n.id} onClick={() => onSelectNeg(n.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, isOwn }) {
  return (
    <div className={`mp-agent-card ${isOwn ? 'own' : ''}`}>
      <div className="mp-agent-head">
        <div className="mp-agent-avatar">{agent.name?.[0]?.toUpperCase() || '?'}</div>
        <div className="mp-agent-meta">
          <div className="mp-agent-name">{agent.name} {isOwn && <span className="mp-own-tag">you</span>}</div>
          <div className="mp-agent-addr" title={agent.address}>
            {agent.address?.slice(0, 6)}…{agent.address?.slice(-4)}
          </div>
        </div>
        <div className={`mp-agent-status ${agent.status}`}>{agent.status}</div>
      </div>
      <div className="mp-agent-trade">
        <span className="mp-tok">{agent.sellAmount} {agent.sellToken?.symbol}</span>
        <ArrowRight size={12} />
        <span className="mp-tok">{agent.buyToken?.symbol}</span>
      </div>
      <div className="mp-agent-range">
        range: {agent.priceMin} – {agent.priceMax}
      </div>
    </div>
  );
}

function NegRow({ neg, agents, selected, onClick }) {
  const a = agents.find((x) => x.id === neg.agentAId);
  const b = agents.find((x) => x.id === neg.agentBId);
  const Icon =
    neg.status === 'negotiating' ? Loader2 :
    neg.status === 'settling'    ? Loader2 :
    neg.status === 'agreed'      ? CheckCircle2 :
    neg.status === 'settled'     ? CheckCircle2 :
    XCircle;
  const spin = neg.status === 'negotiating' || neg.status === 'settling';

  return (
    <button type="button" className={`mp-neg-row ${selected ? 'selected' : ''} ${neg.status}`} onClick={onClick}>
      <Icon size={14} className={spin ? 'mp-spin' : ''} />
      <span className="mp-neg-pair">
        {a?.name || '?'} <ArrowRight size={10} /> {b?.name || '?'}
      </span>
      <span className="mp-neg-status">{neg.status}{neg.messageCount ? ` · ${neg.messageCount} msgs` : ''}</span>
    </button>
  );
}
