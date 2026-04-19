/**
 * Verify the MOCK and USDC tokens we just registered via POST /v2/tokens
 * are actually retrievable. The simple GET /v2/tokens list appears to only
 * surface Planbok's default catalog (native ETH entries), so we:
 *   1. Try getToken(id) for each ID returned by the registration call
 *   2. Call listTokens with filters (standard=erc20, blockchain=ETH-SEPOLIA)
 *   3. Re-run a balance probe on the known seller wallet to see if MOCK/USDC
 *      now appear in /balances
 */

import 'dotenv/config';
import { getToken, listTokens, listWallets, getBalances } from './planbok-client.js';

const IDS = [
  { id: '69e2e1e44a8ad620582b4cee', expectedSymbol: 'MOCK' },
  { id: '69e2e1e4e77599d12336b59e', expectedSymbol: 'USDC' },
];

const SELLER_ADDR = '0x72cc17657d7008ef730c22e4ff5f3c8507c4e2df';

async function main() {
  console.log('── getToken by ID ─────────────────────────────────');
  for (const { id, expectedSymbol } of IDS) {
    try {
      const t = await getToken(id);
      console.log(`  ${expectedSymbol}: id=${t.id} symbol=${t.symbol} addr=${t.address} blockchain=${t.blockchain}`);
    } catch (err) {
      console.log(`  ${expectedSymbol} (id=${id}): ERROR ${err.message}`);
    }
  }

  console.log('\n── listTokens standard=erc20 ──────────────────────');
  try {
    const erc20s = await listTokens({ standard: 'erc20', blockchain: 'ETH-SEPOLIA', limit: 100 });
    if (erc20s.length === 0) {
      console.log('  (empty)');
    } else {
      for (const t of erc20s) {
        console.log(`  ${t.symbol?.padEnd(6) || '?'} ${t.address} id=${t.id}`);
      }
    }
  } catch (err) {
    console.log(`  ERROR ${err.message}`);
  }

  console.log('\n── Seller wallet /balances ────────────────────────');
  try {
    const wallets = await listWallets({ blockchain: 'ETH-SEPOLIA', limit: 100 });
    const w = wallets.find(x => (x.address || '').toLowerCase() === SELLER_ADDR.toLowerCase());
    if (!w) {
      console.log(`  Seller wallet ${SELLER_ADDR} not found in Planbok wallet list`);
    } else {
      const balances = await getBalances(w.id);
      console.log(`  walletId=${w.id}, ${balances.length} balance entries:`);
      for (const b of balances) {
        const sym = b.token?.symbol || '?';
        const addr = b.token?.address || '(native)';
        console.log(`    ${sym.padEnd(6)} ${addr}  amount=${b.amount}`);
      }
    }
  } catch (err) {
    console.log(`  ERROR ${err.message}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
