#!/usr/bin/env node
/**
 * Sweep Orphaned Agent Wallets
 * ─────────────────────────────
 * After test runs that end before settlement, funds stay stuck at Planbok MPC
 * wallets (ETH for gas + whatever sell-token was transferred). Since the server's
 * in-memory agent store is wiped on restart, those wallets become unreachable from
 * the normal app flow. This script:
 *
 *   1. Lists every wallet in our Planbok wallet set
 *   2. Cross-references on-chain balances (Sepolia) for ETH + known tokens
 *   3. Transfers all non-zero balances back to the master wallet
 *      - ERC-20s: executeContract('transfer(address,uint256)')
 *      - Native ETH: executeTransfer(native tokenId from /balances)
 *
 * Run: node sweep-orphaned-wallets.js
 * Env: PLANBOK_API_KEY, PLANBOK_API_URL, PLANBOK_ORG_SECRET, AUTOSWAP_PRIVATE_KEY
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { ethers } from 'ethers';
import {
  listWallets,
  getBalances,
  executeContract,
  executeTransfer,
} from './planbok-client.js';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const SEPOLIA_CHAIN_ID = 11155111;

// Tokens we fund agents with — we sweep any non-zero balance of these back.
// Addresses match tokenlist.json / agent-engine.js.
const SWEEP_TOKENS = [
  { symbol: 'MOCK',  address: '0xab007ED755E3ac0946899dC2DD183362B49Ee207', decimals: 18 },
  { symbol: 'USDC',  address: '0x6589B85C82aa4Dd75f68D4AcB791bA3b9747b34e', decimals: 6  },
  { symbol: 'USDT',  address: '0xf08A50178dfcDe18524640EA6618a1f965821715', decimals: 6  },
  { symbol: 'mUSDT', address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', decimals: 6  },
  { symbol: 'mDAI',  address: '0x68194a729C2450ad26072b3D33ADaCbcef39D574', decimals: 18 },
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

function getMasterAddress() {
  const pk = process.env.AUTOSWAP_PRIVATE_KEY;
  if (!pk) throw new Error('AUTOSWAP_PRIVATE_KEY not set');
  return new ethers.Wallet(pk).address;
}

async function main() {
  const master = getMasterAddress();
  console.log(`Master wallet: ${master}`);
  console.log(`Planbok API:   ${process.env.PLANBOK_API_URL || 'https://api.planbok.io'}`);
  console.log('');

  // ── 1. Enumerate Planbok wallets on Sepolia ──────────────────
  const wallets = await listWallets({ blockchain: 'ETH-SEPOLIA', limit: 100 });
  console.log(`Found ${wallets.length} Planbok wallet(s) on Sepolia`);
  const nonMaster = wallets.filter(
    w => w.address && w.address.toLowerCase() !== master.toLowerCase()
  );
  console.log(`Scanning ${nonMaster.length} non-master wallet(s) for residual funds...\n`);

  // ── 2. Per-wallet sweep ──────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  let totalSwept = { ETH: 0n };
  for (const t of SWEEP_TOKENS) totalSwept[t.symbol] = 0n;

  for (const w of nonMaster) {
    console.log(`── ${w.address} (walletId: ${w.id}) ──`);

    // --- ERC-20 sweeps ---
    for (const token of SWEEP_TOKENS) {
      const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
      let bal;
      try { bal = await erc20.balanceOf(w.address); }
      catch (err) { console.log(`  ${token.symbol}: balance read failed: ${err.message}`); continue; }

      if (bal === 0n) continue;

      const human = ethers.formatUnits(bal, token.decimals);
      console.log(`  ${token.symbol}: ${human} — transferring to master...`);
      try {
        const res = await executeContract({
          walletId: w.id,
          contractAddress: token.address,
          abiFunctionSignature: 'transfer(address,uint256)',
          abiParameters: [master, bal.toString()],
          refId: `sweep-${token.symbol}-${w.id.slice(-6)}`,
        });
        console.log(`    → submitted: txHash=${res.txHash || '(pending)'} planbokTxId=${res.txId}`);
        totalSwept[token.symbol] += bal;
      } catch (err) {
        console.log(`    ! failed: ${err.message.slice(0, 150)}`);
      }
    }

    // --- Native ETH sweep ---
    // Fetch Planbok's balance entry so we can get the native tokenId.
    let planbokBalances;
    try { planbokBalances = await getBalances(w.id); }
    catch (err) { console.log(`  ETH: getBalances failed: ${err.message}`); continue; }

    const nativeEntry = planbokBalances.find(
      b => (b.token?.symbol || b.symbol) === 'ETH' ||
           (b.token?.isNative) ||
           (b.tokenType === 'native')
    );
    const nativeTokenId = nativeEntry?.token?.id || nativeEntry?.tokenId;

    const onChainEth = await provider.getBalance(w.address);
    if (onChainEth === 0n) {
      console.log(`  ETH: 0 (skip)`);
      continue;
    }

    // Leave a safe margin for the transfer tx itself. Planbok's fee estimator is
    // conservative — it wants > 0.001 ETH headroom above the sweep amount even when
    // actual gas is < 0.0002 ETH. Empirically 0.002 ETH margin clears 422s.
    const ETH_MARGIN = ethers.parseEther('0.002');
    if (onChainEth <= ETH_MARGIN) {
      console.log(`  ETH: ${ethers.formatEther(onChainEth)} — below gas margin, skipping`);
      continue;
    }
    const sweepAmount = onChainEth - ETH_MARGIN;
    console.log(`  ETH: ${ethers.formatEther(onChainEth)} — sweeping ${ethers.formatEther(sweepAmount)} (leaving ${ethers.formatEther(ETH_MARGIN)} for gas)...`);

    if (!nativeTokenId) {
      console.log(`    ! no Planbok native tokenId found; skipping ETH sweep`);
      console.log(`    (Planbok balances entries:`, planbokBalances.slice(0, 3).map(b => ({ sym: b.token?.symbol || b.symbol, id: b.token?.id || b.tokenId })), `)`);
      continue;
    }

    try {
      // Planbok's /v2/organization/transactions/transfer takes amount in human-decimal
      // ETH (e.g. "0.018"), NOT wei. Confirmed via GET /v2/wallets/{id}/balances which
      // returns amount: "0.02" for 0.02 ETH.
      const sweepEthString = ethers.formatEther(sweepAmount);
      const res = await executeTransfer({
        walletId: w.id,
        destinationAddress: master,
        tokenId: nativeTokenId,
        amounts: [sweepEthString],
        feeLevel: 'low',
      });
      console.log(`    → submitted: txHash=${res.txHash || '(pending)'} planbokTxId=${res.txId}`);
      totalSwept.ETH += sweepAmount;
    } catch (err) {
      console.log(`    ! failed: ${err.message.slice(0, 200)}`);
    }
  }

  // ── 3. Summary ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('  Sweep Summary');
  console.log('═══════════════════════════════════════');
  console.log(`  ETH:   ${ethers.formatEther(totalSwept.ETH)}`);
  for (const t of SWEEP_TOKENS) {
    const v = totalSwept[t.symbol];
    if (v > 0n) console.log(`  ${t.symbol.padEnd(6)} ${ethers.formatUnits(v, t.decimals)}`);
  }
  console.log('');
  console.log('  Note: Planbok MPC txs take ~10-30s to mine on Sepolia.');
  console.log('  Check master balance in ~1 min to confirm.');
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Sweep failed:', err);
  process.exit(1);
});
