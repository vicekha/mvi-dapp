/**
 * End-to-end settlement test.
 *
 * Creates two fresh MPC agents (MOCK seller, USDC buyer), fakes an agreed
 * negotiation at 1.15 USDC/MOCK, and drives settleNegotiation() to confirm
 * the fee-headroom fix resolved "Insufficient balance" on createOrder.
 */
import 'dotenv/config';
import { createAgent } from './agent-engine.js';
import { settleNegotiation } from './settlement.js';

const CHAIN = 11155111;
const MOCK = {
  chainId: CHAIN,
  address: '0xab007ED755E3ac0946899dC2DD183362B49Ee207',
  symbol: 'MOCK',
  name: 'Mock Token',
  decimals: 18,
  basePrice: 1,
};
const USDC = {
  chainId: CHAIN,
  address: '0x6589B85C82aa4Dd75f68D4AcB791bA3b9747b34e',
  symbol: 'USDC',
  name: 'USD Coin (test)',
  decimals: 6,
  basePrice: 1.15,
};

const SELL_AMOUNT = 0.1;
const AGREED_PRICE = 1.15;

async function main() {
  const stamp = Date.now().toString(36);

  console.log('=== Creating seller (MOCK → USDC) ===');
  const seller = await createAgent({
    id: `seller-${stamp}`,
    name: 'E2E Seller',
    strategy: 'aggressive',
    sellToken: MOCK,
    buyToken: USDC,
    sellAmount: SELL_AMOUNT,
    priceMin: 1.0,
    priceMax: 1.2,
    maxRounds: 3,
    ownerAddress: null,
    fundAmount: SELL_AMOUNT, // engine adds +1% headroom
  });

  console.log('=== Creating buyer (USDC → MOCK) ===');
  const buyer = await createAgent({
    id: `buyer-${stamp}`,
    name: 'E2E Buyer',
    strategy: 'aggressive',
    sellToken: USDC,
    buyToken: MOCK,
    sellAmount: SELL_AMOUNT * AGREED_PRICE,
    priceMin: 0.8,
    priceMax: 1.0,
    maxRounds: 3,
    ownerAddress: null,
    fundAmount: SELL_AMOUNT * AGREED_PRICE,
  });

  console.log('\n[E2E] Seller wallet:', seller.wallet.address);
  console.log('[E2E] Buyer  wallet:', buyer.wallet.address);

  const negotiation = {
    id: `neg-e2e-${stamp}`,
    agentA: seller.id,
    agentB: buyer.id,
    status: 'agreed',
    agreedPrice: AGREED_PRICE,
    history: [],
  };

  console.log('\n=== Settling ===');
  const result = await settleNegotiation(negotiation, seller, buyer);
  console.log('\n✅ SETTLEMENT SUCCESS');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('\n❌ SETTLEMENT FAILED');
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
