import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, ArrowRight, Loader2, CheckCircle2, AlertTriangle, Shield, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import { settleNegotiationManual } from '../../config/planbok.js';

export default function SettlementModal({ isOpen, onClose, settlement, activeNetwork, targetNetwork, account, onSuccess }) {
  const [status, setStatus] = useState('preview'); // preview | submitting | success | error
  const [txHash, setTxHash] = useState('');
  const [fulfillTxHash, setFulfillTxHash] = useState('');
  const [error, setError] = useState('');

  if (!isOpen || !settlement) return null;

  const { sellToken, buyToken, sellAmountRaw, buyAmountRaw, rate, negId } = settlement;

  const explorerUrl = (hash) => {
    const explorers = {
      11155111: 'https://sepolia.etherscan.io',
      84532: 'https://sepolia.basescan.org',
      146: 'https://sonicscan.org',
      14601: 'https://testnet.sonicscan.org',
    };
    const base = explorers[activeNetwork?.id] || 'https://sepolia.etherscan.io';
    return `${base}/tx/${hash}`;
  };

  const handleSettle = async () => {
    try {
      setStatus('submitting');
      setError('');

      // Call backend to settle — this handles both createOrder + fulfillOrder
      const result = await settleNegotiationManual(negId);

      if (result.error) throw new Error(result.error);

      setTxHash(result.txHash || result.settlement?.txHash || '');
      setFulfillTxHash(result.fulfillTxHash || result.settlement?.fulfillTxHash || '');
      setStatus('success');

      if (onSuccess) {
        onSuccess(
          result.txHash || result.settlement?.txHash,
          result.fulfillTxHash || result.settlement?.fulfillTxHash,
        );
      }
    } catch (err) {
      setError(err.message || 'Settlement failed');
      setStatus('error');
    }
  };

  return (
    <AnimatePresence>
      <motion.div className="settlement-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div className="settlement-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()}>
          <div className="settlement-header">
            <h3><Zap size={18} /> Settlement</h3>
            <button className="settlement-close" onClick={onClose}><X size={18} /></button>
          </div>

          <div className="settlement-body">
            <div className="settlement-pair">
              <div className="settlement-side sell">
                <span className="settlement-side-label">Agent A Sells</span>
                <span className="settlement-side-amount">{sellAmountRaw?.toFixed(6)}</span>
                <span className="settlement-side-token">{sellToken?.symbol}</span>
                <span className="settlement-side-chain">{activeNetwork?.name}</span>
              </div>
              <ArrowRight size={20} className="settlement-arrow" />
              <div className="settlement-side buy">
                <span className="settlement-side-label">Agent B Sends</span>
                <span className="settlement-side-amount">{buyAmountRaw?.toFixed(6)}</span>
                <span className="settlement-side-token">{buyToken?.symbol}</span>
                <span className="settlement-side-chain">{targetNetwork?.name}</span>
              </div>
            </div>

            <div className="settlement-details">
              <div className="settlement-row">
                <span>Agreed Rate</span>
                <span className="settlement-value">1 {sellToken?.symbol} = {rate?.toFixed(6)} {buyToken?.symbol}</span>
              </div>
              <div className="settlement-row">
                <span>Protocol Fee</span>
                <span className="settlement-value">
                  {sellToken?.address === ethers.ZeroAddress || sellToken?.address === '0x0000000000000000000000000000000000000000' ? '0.1%' : '0.05%'}
                </span>
              </div>
              <div className="settlement-row">
                <span>Settlement</span>
                <span className="settlement-value"><Shield size={12} /> AutoSwap (createOrder + fulfillOrder)</span>
              </div>
              <div className="settlement-row">
                <span>Signing</span>
                <span className="settlement-value"><Shield size={12} /> Planbok MPC Wallet</span>
              </div>
            </div>

            {status === 'error' && (
              <div className="settlement-error">
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            {status === 'success' && (
              <div className="settlement-success">
                <CheckCircle2 size={14} /> Trade settled successfully!
                {txHash && (
                  <a href={explorerUrl(txHash)} target="_blank" rel="noopener noreferrer" className="settlement-tx-link">
                    <ExternalLink size={12} /> Create Order TX
                  </a>
                )}
                {fulfillTxHash && (
                  <a href={explorerUrl(fulfillTxHash)} target="_blank" rel="noopener noreferrer" className="settlement-tx-link">
                    <ExternalLink size={12} /> Fulfill Order TX
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="settlement-footer">
            {status === 'preview' && (
              <button className="settlement-confirm-btn" onClick={handleSettle}>
                <Zap size={16} /> Settle via Agent Server
              </button>
            )}
            {status === 'submitting' && (
              <button className="settlement-confirm-btn" disabled>
                <Loader2 size={16} className="spin" /> Creating order & fulfilling...
              </button>
            )}
            {(status === 'success' || status === 'error') && (
              <button className="settlement-close-btn" onClick={onClose}>Close</button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
