import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, CheckCircle2, XCircle, ArrowRight, Zap, Brain, Loader2, ExternalLink } from 'lucide-react';
import { MSG_TYPE, NEG_STATUS } from '../../engine/negotiation.js';

function PriceBar({ offerA, offerB, fairRate, minRate, maxRate }) {
  const range = maxRate - minRate || 1;
  const posA = ((offerA - minRate) / range) * 100;
  const posB = ((offerB - minRate) / range) * 100;
  const posFair = ((fairRate - minRate) / range) * 100;

  return (
    <div className="neg-price-bar">
      <div className="neg-price-track">
        <div className="neg-price-fair" style={{ left: `${Math.min(95, Math.max(5, posFair))}%` }} />
        {offerA > 0 && (
          <motion.div
            className="neg-price-dot seller"
            animate={{ left: `${Math.min(95, Math.max(5, posA))}%` }}
            transition={{ type: 'spring', stiffness: 200 }}
          />
        )}
        {offerB > 0 && (
          <motion.div
            className="neg-price-dot buyer"
            animate={{ left: `${Math.min(95, Math.max(5, posB))}%` }}
            transition={{ type: 'spring', stiffness: 200 }}
          />
        )}
      </div>
      <div className="neg-price-labels">
        <span>{minRate?.toFixed(4)}</span>
        <span className="neg-price-fair-label">Fair: {fairRate?.toFixed(4)}</span>
        <span>{maxRate?.toFixed(4)}</span>
      </div>
    </div>
  );
}

function NegMessage({ msg, isUser }) {
  const [showThinking, setShowThinking] = useState(false);

  const typeStyles = {
    [MSG_TYPE.OFFER]: 'offer',
    [MSG_TYPE.COUNTER]: 'counter',
    [MSG_TYPE.ACCEPT]: 'accept',
    [MSG_TYPE.REJECT]: 'reject',
    [MSG_TYPE.SYSTEM]: 'system',
    [MSG_TYPE.INFO]: 'info',
  };

  const typeIcons = {
    [MSG_TYPE.ACCEPT]: <CheckCircle2 size={13} />,
    [MSG_TYPE.REJECT]: <XCircle size={13} />,
    [MSG_TYPE.SYSTEM]: <Zap size={13} />,
  };

  return (
    <motion.div
      className={`neg-message ${typeStyles[msg.type] || ''} ${isUser ? 'from-user' : 'from-npc'}`}
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="neg-msg-header">
        <span className="neg-msg-sender">{msg.senderName}</span>
        {typeIcons[msg.type]}
        {msg.thinking && (
          <button
            className="neg-thinking-toggle"
            onClick={() => setShowThinking(!showThinking)}
            title="Show AI reasoning"
          >
            <Brain size={11} />
          </button>
        )}
        <span className="neg-msg-time">
          {msg.timestamp?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || ''}
        </span>
      </div>
      <div className="neg-msg-body">{msg.message}</div>
      {msg.price > 0 && msg.type !== MSG_TYPE.ACCEPT && (
        <div className="neg-msg-price">
          <ArrowRight size={12} />
          <span>{msg.price}</span>
        </div>
      )}
      {showThinking && msg.thinking && (
        <motion.div
          className="neg-msg-thinking"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          <Brain size={11} /> <span>{msg.thinking}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function NegotiationPanel({ negotiation, userAgent, counterparty, onSettle, onCancel, fairRate }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [negotiation?.history?.length]);

  if (!negotiation || !counterparty) {
    return (
      <div className="negotiation-panel empty">
        <div className="mp-section-header">
          <MessageSquare size={18} />
          <span>Negotiation</span>
        </div>
        <div className="neg-empty">
          <MessageSquare size={40} />
          <p>Select a counterparty agent to start AI-powered negotiation</p>
        </div>
      </div>
    );
  }

  const { history, status, round, agreedPrice } = negotiation;
  const lastUserOffer = [...(history || [])].reverse().find(m => m.sender === userAgent?.id && m.price > 0)?.price || 0;
  const lastNpcOffer = [...(history || [])].reverse().find(m => m.sender === counterparty?.id && m.price > 0)?.price || 0;

  const minRate = Math.min(userAgent?.priceMin || 0, counterparty?.priceMin || 0, (fairRate || 1) * 0.8);
  const maxRate = Math.max(userAgent?.priceMax || 1, counterparty?.priceMax || 1, (fairRate || 1) * 1.2);

  return (
    <div className="negotiation-panel">
      <div className="mp-section-header">
        <MessageSquare size={18} />
        <span>AI Negotiation</span>
        <span className="neg-round-badge">Round {round}</span>
      </div>

      {/* Price convergence visualization */}
      <div className="neg-convergence">
        <div className="neg-convergence-header">
          <span className="neg-agent-label seller">{userAgent?.name}</span>
          <span className="neg-vs">vs</span>
          <span className="neg-agent-label buyer">{counterparty?.name}</span>
        </div>
        <PriceBar
          offerA={lastUserOffer}
          offerB={lastNpcOffer}
          fairRate={fairRate}
          minRate={minRate}
          maxRate={maxRate}
        />
      </div>

      {/* Chat log */}
      <div className="neg-messages" ref={scrollRef}>
        <AnimatePresence>
          {(history || []).map((msg) => (
            <NegMessage
              key={msg.id}
              msg={msg}
              isUser={msg.sender === userAgent?.id}
            />
          ))}
          {status === NEG_STATUS.NEGOTIATING && (
            <motion.div
              className="neg-message system"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="neg-msg-body" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={14} className="spin" /> Claude agents are thinking...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div className="neg-status-bar">
        {status === NEG_STATUS.NEGOTIATING && (
          <button className="neg-action-btn cancel" onClick={onCancel}>
            <XCircle size={14} /> Cancel
          </button>
        )}
        {status === NEG_STATUS.AGREED && (
          <button className="neg-action-btn settle" onClick={onSettle}>
            <Zap size={14} /> Settle on AutoSwap — {agreedPrice?.toFixed(6)}
          </button>
        )}
        {status === NEG_STATUS.SETTLING && (
          <div className="neg-status-msg settling">
            <Loader2 size={14} className="spin" /> Settling on-chain...
          </div>
        )}
        {status === NEG_STATUS.FAILED && (
          <div className="neg-status-msg failed">
            <XCircle size={14} /> Negotiation failed — agents could not agree
          </div>
        )}
        {status === NEG_STATUS.SETTLED && (
          <div className="neg-status-msg settled">
            <CheckCircle2 size={14} /> Trade settled on AutoSwap
          </div>
        )}
      </div>
    </div>
  );
}
