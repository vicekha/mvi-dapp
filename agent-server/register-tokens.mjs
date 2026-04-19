/**
 * One-shot script: register AutoSwap's mock MOCK and USDC ERC-20s with the
 * Planbok organization token registry so that /balances surfaces them and
 * contract-execution pre-flight stops returning 422 "Insufficient funds for
 * transaction".
 *
 * Usage (from agent-server/):
 *   node register-tokens.mjs           # register both
 *   node register-tokens.mjs --list    # list current registry only
 *   node register-tokens.mjs --meta    # print Planbok chain/standard metadata
 */

import 'dotenv/config';
import { addToken, listTokens, getTokenMetadata } from './planbok-client.js';

const BLOCKCHAIN = 'ETH-SEPOLIA';

const TOKENS = [
  {
    blockchain: BLOCKCHAIN,
    standard: 'erc20',
    address: '0xab007ED755E3ac0946899dC2DD183362B49Ee207',
    symbol: 'MOCK',
    decimals: 18,
    name: 'AutoSwap Mock Token',
  },
  {
    blockchain: BLOCKCHAIN,
    standard: 'erc20',
    address: '0x6589B85C82aa4Dd75f68D4AcB791bA3b9747b34e',
    symbol: 'USDC',
    decimals: 6,
    name: 'AutoSwap Test USDC',
  },
];

function norm(a) { return (a || '').toLowerCase(); }

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--meta')) {
    const meta = await getTokenMetadata();
    console.log(JSON.stringify(meta, null, 2));
    return;
  }

  // Always fetch the current registry up front so we can skip duplicates.
  const existing = await listTokens({ blockchain: BLOCKCHAIN, limit: 100 });
  console.log(`[Registry] ${existing.length} token(s) already registered on ${BLOCKCHAIN}:`);
  for (const t of existing) {
    console.log(`   ${t.symbol?.padEnd(6) || '?'} ${t.address || '(native)'}  id=${t.id}  standard=${t.standard}`);
  }

  if (args.includes('--list')) return;

  for (const spec of TOKENS) {
    const dupe = existing.find(t =>
      t.blockchain === spec.blockchain &&
      norm(t.address) === norm(spec.address)
    );
    if (dupe) {
      console.log(`[Skip ] ${spec.symbol} already registered (id=${dupe.id})`);
      continue;
    }
    try {
      const created = await addToken(spec);
      console.log(`[Added] ${spec.symbol} ${spec.address} → id=${created.id}`);
    } catch (err) {
      console.error(`[Fail ] ${spec.symbol}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  // Re-list so the operator can see the final state.
  const after = await listTokens({ blockchain: BLOCKCHAIN, limit: 100 });
  console.log(`\n[Registry] Post-registration count on ${BLOCKCHAIN}: ${after.length}`);
  for (const t of after) {
    console.log(`   ${t.symbol?.padEnd(6) || '?'} ${t.address || '(native)'}  id=${t.id}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
