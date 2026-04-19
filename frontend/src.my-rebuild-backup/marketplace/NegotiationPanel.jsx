import React, { useEffect, useRef, useState } from 'react';
import { Brain, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

/**
 * NegotiationPanel — renders the full transcript of a single negotiation.
 * Each message can be expanded to reveal the raw Claude "thinking" (any free
 * text the model emitted alongside its tool call).
 */
export default function NegotiationPanel({ negotiation, agents }) {
  const scroller = useRef(null);
  useEffect(() => {
    if (!scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [negotiation?.messages?.length]);

  if (!negotiation) {
    return (
      <div className="mp-neg-empty">
        Select an active negotiation on the left to watch the agents talk.
      </div>
    );
  }

  const a = agents.find((x) => x.id === negotiation.agentAId);
  const b = agents.find((x) => x.id === negotiation.agentBId);

  return (
    <div className="mp-neg-panel">
      <div className="mp-neg-header">
        <div className="mp-neg-headline">
          <strong>{a?.name || '?'}</strong>
          <span className="mp-neg-vs">vs</span>
          <strong>{b?.name || '?'}</strong>
        </div>
        <StatusPill status={negotiation.status} />
      </div>

      <div className="mp-neg-sub">
        {negotiation.sellToken?.symbol} ↔ {negotiation.buyToken?.symbol}
        {negotiation.agreed && (
          <span className="mp-agreed-tag">
            agreed @ {negotiation.agreed.price} × {negotiation.agreed.amount}
          </span>
        )}
      </div>

      <div className="mp-msg-scroll" ref={scroller}>
        {(negotiation.messages || []).map((m) => (
          <MessageRow key={m.id} msg={m} selfId={a?.id} />
        ))}
        {negotiation.status === 'negotiating' && (
          <div className="mp-thinking-indicator">
            <Loader2 size={12} className="mp-spin" /> Claude agents deliberating…
          </div>
        )}
        {negotiation.status === 'settling' && (
          <div className="mp-thinking-indicator">
            <Loader2 size={12} className="mp-spin" /> Settling on-chain…
          </div>
        )}
      </div>

      {negotiation.settlement && (
        <SettlementFooter settlement={negotiation.settlement} />
      )}
      {negotiation.failureReason && (
        <div className="mp-failure">
          <XCircle size={14} /> {negotiation.failureReason}
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg, selfId }) {
  const [expanded, setExpanded] = useState(false);
  const isA = msg.agentId === selfId;
  const hasThinking = !!msg.thinking?.trim();
  const Icon = msg.action === 'accept' ? CheckCircle2 : msg.action === 'reject' ? XCircle : Brain;

  return (
    <div className={`mp-msg ${isA ? 'side-a' : 'side-b'} action-${msg.action}`}>
      <div className="mp-msg-head">
        <span className="mp-msg-name">{msg.agentName}</span>
        <span className={`mp-msg-action mp-action-${msg.action}`}>
          <Icon size={12} /> {msg.action}
        </span>
        {msg.price != null && (
          <span className="mp-msg-numbers">
            @ {msg.price} × {msg.amount}
          </span>
        )}
      </div>
      <div className="mp-msg-text">{msg.text}</div>
      {hasThinking && (
        <button
          type="button"
          className="mp-thinking-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'hide reasoning' : 'show reasoning'}
        </button>
      )}
      {expanded && hasThinking && (
        <div className="mp-msg-thinking">{msg.thinking}</div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const cls = `mp-status-pill status-${status}`;
  const Icon =
    status === 'negotiating' ? Loader2 :
    status === 'settling'    ? Loader2 :
    status === 'agreed'      ? CheckCircle2 :
    status === 'settled'     ? CheckCircle2 :
    XCircle;
  const spin = status === 'negotiating' || status === 'settling';
  return (
    <span className={cls}>
      <Icon size={12} className={spin ? 'mp-spin' : ''} />
      {status}
    </span>
  );
}

function SettlementFooter({ settlement }) {
  const base = 'https://sepolia.etherscan.io/tx/';
  return (
    <div className="mp-settlement-footer">
      <div className="mp-settlement-title">
        <CheckCircle2 size={14} /> Settled on Sepolia
      </div>
      <a href={`${base}${settlement.createTxHash}`} target="_blank" rel="noreferrer" className="mp-tx-link">
        createOrder <ExternalLink size={10} />
      </a>
      <a href={`${base}${settlement.fulfillTxHash}`} target="_blank" rel="noreferrer" className="mp-tx-link">
        fulfillOrder <ExternalLink size={10} />
      </a>
      {settlement.orderId && (
        <div className="mp-order-id">
          order: {String(settlement.orderId).slice(0, 12)}…
        </div>
      )}
    </div>
  );
}
