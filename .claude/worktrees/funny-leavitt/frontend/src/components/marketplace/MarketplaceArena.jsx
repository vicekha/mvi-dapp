import React from 'react';
import { motion } from 'framer-motion';
import { Radio, Users, Zap } from 'lucide-react';
import AgentCard from './AgentCard';

export default function MarketplaceArena({ userAgent, npcAgents, onSelectCounterparty, activeNegotiation }) {
  const compatible = npcAgents.filter(a => a.isCompatible);
  const others = npcAgents.filter(a => !a.isCompatible);

  return (
    <div className="marketplace-arena">
      <div className="mp-section-header">
        <Radio size={18} />
        <span>Marketplace Arena</span>
        <span className="mp-agent-count">{npcAgents.length} agents</span>
      </div>

      {/* User's agent card */}
      {userAgent && (
        <div className="mp-user-agent-section">
          <div className="mp-subsection-label">
            <Zap size={13} /> Your Agent
          </div>
          <AgentCard agent={userAgent} isUser />
        </div>
      )}

      {/* Scanning animation before agents appear */}
      {!userAgent && (
        <div className="mp-empty-arena">
          <Users size={40} />
          <p>Configure and deploy your agent to enter the marketplace</p>
        </div>
      )}

      {/* Compatible counterparties */}
      {compatible.length > 0 && (
        <div className="mp-counterparties-section">
          <div className="mp-subsection-label compatible">
            <Zap size={13} /> Compatible Counterparties ({compatible.length})
          </div>
          <motion.div
            className="mp-agents-grid"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            {compatible.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onClick={() => onSelectCounterparty(agent)}
                isActive={activeNegotiation?.counterparty?.id === agent.id}
                isNegotiating={activeNegotiation?.counterparty?.id === agent.id && activeNegotiation?.status === 'negotiating'}
              />
            ))}
          </motion.div>
        </div>
      )}

      {/* Other agents in the marketplace */}
      {others.length > 0 && (
        <div className="mp-others-section">
          <div className="mp-subsection-label">
            <Users size={13} /> Other Agents ({others.length})
          </div>
          <motion.div
            className="mp-agents-grid"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {others.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </motion.div>
        </div>
      )}

      {userAgent && npcAgents.length === 0 && (
        <div className="mp-scanning">
          <div className="mp-scanning-pulse" />
          <span>Scanning for counterparties...</span>
        </div>
      )}
    </div>
  );
}
