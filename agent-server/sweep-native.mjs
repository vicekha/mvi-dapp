#!/usr/bin/env node
/**
 * Native-Only Sweep — Sepolia + Base Sepolia
 * ─────────────────────────────────────────
 * Transfers all native ETH balances from Planbok MPC wallets back to the
 * master wallet (AUTOSWAP_PRIVATE_KEY). Skips ERC-20s entirely.
 *
 * Run: node sweep-native.mjs
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { ethers } from 'ethers';
import { listWallets, getBalances, executeTransfer } from './planbok-client.js';

const CHAINS = [
  {
    name: 'Sepolia',
    chainId: 11155111,
    planbok: 'ETH-SEPOLIA',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  {
    name: 'Base Sepolia',
    chainId: 84532,
    planbok: 'BASE-SEPOLIA',
    rpc: 'https://sepolia.base.org',
  },
];

const ETH_MARGIN = ethers.parseEther('0.002'); // gas headroom Planbok wants

function getMaster() {
  const pk = process.env.AUTOSWAP_PRIVATE_KEY;
  if (!pk) throw new Error('AUTOSWAP_PRIVATE_KEY not set');
  return new ethers.Wallet(pk).address;
}

async function sweepChain(chain, master) {
  console.log(`\n══════ ${chain.name} (chainId ${chain.chainId}) ══════`);
  const provider = new ethers.JsonRpcProvider(chain.rpc);

  const wallets = await listWallets({ blockchain: chain.planbok, limit: 100 });
  const targets = wallets.filter(w => w.address?.toLowerCase() !== master.toLowerCase());
  console.log(`Found ${wallets.length} wallet(s); sweeping ${targets.length} non-master.\n`);

  let swept = 0n;
  for (const w of targets) {
    const onChain = await provider.getBalance(w.address);
    if (onChain === 0n) continue;

    if (onChain <= ETH_MARGIN) {
      console.log(`  ${w.address}: ${ethers.formatEther(onChain)} ETH — below gas margin, skip`);
      continue;
    }

    let balances;
    try { balances = await getBalances(w.id); }
    catch (err) { console.log(`  ${w.address}: getBalances failed: ${err.message}`); continue; }

    const nativeEntry = balances.find(
      b => (b.token?.symbol || b.symbol) === (chain.chainId === 84532 ? 'ETH' : 'ETH') ||
           b.token?.isNative || b.tokenType === 'native'
    );
    const nativeTokenId = nativeEntry?.token?.id || nativeEntry?.tokenId;
    if (!nativeTokenId) {
      console.log(`  ${w.address}: no native tokenId; skip`);
      continue;
    }

    const sweepAmount = onChain - ETH_MARGIN;
    const human = ethers.formatEther(sweepAmount);
    console.log(`  ${w.address}: ${ethers.formatEther(onChain)} → sweeping ${human}`);

    try {
      const res = await executeTransfer({
        walletId: w.id,
        destinationAddress: master,
        tokenId: nativeTokenId,
        amounts: [human],
        feeLevel: 'low',
      });
      console.log(`    → submitted: tx=${res.txHash || '(pending)'} planbokTxId=${res.txId}`);
      swept += sweepAmount;
    } catch (err) {
      console.log(`    ! failed: ${err.message.slice(0, 180)}`);
    }
  }

  console.log(`\n${chain.name} total swept: ${ethers.formatEther(swept)} ETH`);
  return swept;
}

async function main() {
  const master = getMaster();
  console.log(`Master wallet: ${master}`);

  let grand = 0n;
  for (const c of CHAINS) {
    try { grand += await sweepChain(c, master); }
    catch (err) { console.error(`${c.name} failed:`, err.message); }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`  GRAND TOTAL: ${ethers.formatEther(grand)} ETH swept`);
  console.log('  (Planbok txs mine in ~10-30s — check master in ~1min)');
  console.log('═══════════════════════════════════════');
}

main().catch(err => { console.error(err); process.exit(1); });
