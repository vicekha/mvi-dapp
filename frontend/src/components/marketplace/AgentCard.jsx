import React from 'react';
import { motion } from 'framer-motion';
import { Flame, Scale, Leaf, ArrowRight, Zap, Bot, X } from 'lucide-react';

const STRATEGY_ICONS = {
  aggressive: Flame,
  moderate: Scale,
  passive: Leaf,
};

export default function AgentCard({ agent, onClick, onRemove, isUser, isActive, isNegotiating }) {
  const Icon = STRATEGY_ICONS[agent.strategy] || Bot;
  const strat = agent.strategyConfig;

  return (
    <motion.div
      className={`agent-card ${isUser ? 'user' : 'npc'} ${agent.isCompatible ? 'compatible' : ''} ${isActive ? 'active' : ''} ${isNegotiating ? 'negotiating' : ''}`}
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02, y: -2 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        '--agent-hue': agent.hue || 260,
        '--agent-color': strat?.color || 'var(--primary)',
      }}
    >
      <div className="agent-card-header">
        <div className="agent-avatar" style={{ background: `hsl(${agent.hue || 260}, 60%, 50%)` }}>
          {isUser ? <Bot size={18} /> : <span>{agent.name?.[0]}</span>}
        </div>
        <div className="agent-identity">
          <span className="agent-name">{agent.name}</span>
          <span className="agent-strategy-badge" style={{ color: strat?.color }}>
            <Icon size={11} />
            {strat?.name || agent.strategy}
          </span>
        </div>
        {agent.isCompatible && (
          <span className="agent-compatible-tag">
            <Zap size={10} /> Match
          </span>
        )}
        {onRemove && (
          <button
            className="agent-remove-btn"
            title={isUser ? 'Remove your agent' : 'Remove this agent'}
            onClick={(e) => { e.stopPropagation(); onRemove(agent.id); }}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.6)',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.borderColor = '#ff6b6b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="agent-trade-pair">
        <div className="agent-token sell">
          <span className="agent-token-label">Sells</span>
          <span className="agent-token-symbol">{agent.sellToken?.symbol || '—'}</span>
          <span className="agent-token-amount">{agent.sellAmount}</span>
        </div>
        <ArrowRight size={14} className="agent-arrow" />
        <div className="agent-token buy">
          <span className="agent-token-label">Wants</span>
          <span className="agent-token-symbol">{agent.buyToken?.symbol || '—'}</span>
        </div>
      </div>

      <div className="agent-price-range">
        <span className="agent-range-label">Price Range</span>
        <span className="agent-range-values">
          {agent.priceMin?.toFixed(4)} — {agent.priceMax?.toFixed(4)}
        </span>
      </div>

      {isNegotiating && (
        <div className="agent-negotiating-indicator">
          <div className="agent-pulse" />
          Negotiating...
        </div>
      )}
    </motion.div>
  );
}
