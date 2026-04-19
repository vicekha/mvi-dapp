/**
 * Planbok MPC Wallet Client — v2 API
 * Server-side wrapper for Planbok's 2-of-2 MPC wallet infrastructure.
 *
 * API Docs: https://docs.planbok.io/api/wallets
 * Auth: PLANBOK-X-API-KEY header
 * Base: https://api.planbok.io/v2
 */

import { randomUUID, publicEncrypt, randomBytes, constants as cryptoConstants } from 'crypto';

// Read lazily to avoid ESM hoisting issues with dotenv
function getBase() { return process.env.PLANBOK_API_URL || 'https://api.planbok.io'; }
function getKey() { return process.env.PLANBOK_API_KEY || ''; }

// Cache wallet set ID and org public key
let _walletSetId = null;
let _orgPublicKey = null;

// Clock skew between our server and Planbok's. Measured on first encryption and
// refreshed periodically. Planbok rejects payloads with timestamp > planbokNow + TTL,
// so if our clock is ahead of Planbok's (observed: ~60 min on some accounts) every
// request fails with "Payload expired" unless we adjust.
let _planbokClockOffsetMs = 0;      // planbokNow - ourNow, added to Date.now() before encrypting
let _planbokOffsetFetchedAt = 0;
const OFFSET_STALE_MS = 10 * 60 * 1000; // re-measure every 10 minutes

async function refreshPlanbokClockOffset() {
  try {
    const t0 = Date.now();
    const res = await fetch(`${getBase()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    const t1 = Date.now();
    const dateHeader = res.headers.get('date');
    if (!dateHeader) return;
    const planbokMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(planbokMs)) return;
    // Estimate our clock at the midpoint of the round trip
    const ourAtResponse = (t0 + t1) / 2;
    const offset = planbokMs - ourAtResponse;
    _planbokClockOffsetMs = offset;
    _planbokOffsetFetchedAt = Date.now();
    if (Math.abs(offset) > 5000) {
      console.warn(
        `[Planbok] Clock offset detected: ${Math.round(offset / 1000)}s ` +
        `(${offset > 0 ? 'Planbok ahead' : 'Planbok behind'}). ` +
        `Aligning payload timestamps.`
      );
    }
  } catch (err) {
    // Don't crash signing if offset fetch fails — just log once
    console.warn('[Planbok] Could not measure clock offset:', err.message);
  }
}

/**
 * Get the organization's RSA public key (cached)
 */
async function getOrgPublicKey() {
  if (_orgPublicKey) return _orgPublicKey;
  const result = await planbokFetch('/v2/config/organization/public-key');
  _orgPublicKey = result.data?.publicKey;
  if (!_orgPublicKey) throw new Error('Could not retrieve organization public key from Planbok');
  return _orgPublicKey;
}

/**
 * Encrypt the organization secret for a specific context.
 * Based on: https://github.com/nerdjango/planbok-v2-beta-docs/blob/main/generate-encrypted-organization-secret.js
 *
 * The payload is JSON: { secret, timestamp, context }
 * Encrypted with RSA-OAEP + SHA-256 using the org's public key.
 *
 * Context values:
 *  - 'dkg'    → organization setup / DKG initiation
 *  - 'sign'   → creating wallets, signing transactions, signing messages
 *  - 'verify' → private key exporting
 *
 * @param {'dkg'|'sign'|'verify'} context
 * @returns {string} base64-encoded encrypted ciphertext
 */
async function encryptOrgSecret(context = 'sign') {
  const orgSecretHex = process.env.PLANBOK_ORG_SECRET;
  if (!orgSecretHex) {
    throw new Error(
      'PLANBOK_ORG_SECRET not set. This is the 32-byte hex organization secret from Planbok registration. ' +
      'Add it to .env: PLANBOK_ORG_SECRET=<64-char-hex-string>'
    );
  }

  // Validate: must be 32 bytes (64 hex chars)
  const secretBuf = Buffer.from(orgSecretHex, 'hex');
  if (secretBuf.length !== 32) {
    throw new Error(`PLANBOK_ORG_SECRET must be 32 bytes (64 hex chars), got ${secretBuf.length} bytes`);
  }

  const publicKey = await getOrgPublicKey();

  // Ensure the clock offset is fresh before stamping the payload.
  if (Date.now() - _planbokOffsetFetchedAt > OFFSET_STALE_MS) {
    await refreshPlanbokClockOffset();
  }

  // Build the JSON payload — timestamp is aligned to Planbok's clock so their
  // TTL check doesn't treat our fresh payload as expired due to clock skew.
  const payload = JSON.stringify({
    secret: orgSecretHex,
    timestamp: Date.now() + _planbokClockOffsetMs,
    context,
  });

  // Encrypt with RSA-OAEP + SHA-256
  const encrypted = publicEncrypt(
    {
      key: publicKey,
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(payload, 'utf8'),
  );

  return encrypted.toString('base64');
}

/**
 * Core fetch wrapper with Planbok v2 auth
 */
async function planbokFetch(path, options = {}) {
  const res = await fetch(`${getBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'PLANBOK-X-API-KEY': getKey(),
      ...options.headers,
    },
    signal: options.signal || AbortSignal.timeout(15000),
  });

  const contentType = res.headers.get('content-type') || '';
  let body;
  if (contentType.includes('json')) {
    body = await res.json();
  } else {
    const text = await res.text();
    throw new Error(`Planbok ${path}: ${res.status} — ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = body?.message || body?.error || JSON.stringify(body);
    throw new Error(`Planbok ${path}: ${res.status} — ${msg}`);
  }

  return body;
}

// ── Wallet Sets ─────────────────────────────────────────────────

/**
 * Get or create the AutoSwap wallet set (one per deployment)
 */
export async function getOrCreateWalletSet() {
  if (_walletSetId) return _walletSetId;

  // Try listing existing wallet sets first
  try {
    const list = await planbokFetch('/v2/wallet-sets?limit=50');
    const sets = list.data || [];
    const existing = sets.find(s => s.name === 'autoswap-agents');
    if (existing) {
      _walletSetId = existing.id;
      console.log(`[Planbok] Using existing wallet set: ${_walletSetId}`);
      return _walletSetId;
    }
  } catch (err) {
    console.log(`[Planbok] Could not list wallet sets: ${err.message}`);
  }

  // Create new wallet set (requires encrypted org secret for trustless MPC)
  const encryptedSecret = await encryptOrgSecret('sign');
  const result = await planbokFetch('/v2/organization/wallet-sets', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      name: 'autoswap-agents',
      encryptedOrganizationSecret: encryptedSecret,
    }),
  });

  _walletSetId = result.data?.walletSet?.id;
  console.log(`[Planbok] Created wallet set: ${_walletSetId}`);
  return _walletSetId;
}

// ── Wallets ─────────────────────────────────────────────────────

/**
 * Blockchain ID mapping for Planbok
 */
const CHAIN_TO_PLANBOK = {
  11155111: 'ETH-SEPOLIA',
  84532: 'BASE-SEPOLIA',
  1: 'ETH',
  8453: 'BASE',
  137: 'POL',
  80002: 'POL-AMOY',
  42161: 'ARB',
  421614: 'ARB-SEPOLIA',
  10: 'OP',
  11155420: 'OP-SEPOLIA',
};

/**
 * Create a new MPC wallet for an AI agent
 */
export async function createAgentWallet(agentId, chainIds = [11155111, 84532]) {
  const walletSetId = await getOrCreateWalletSet();

  const blockchains = chainIds
    .map(id => CHAIN_TO_PLANBOK[id])
    .filter(Boolean);

  if (blockchains.length === 0) blockchains.push('ETH-SEPOLIA');

  const encryptedSecret = await encryptOrgSecret('sign');
  const result = await planbokFetch('/v2/organization/wallets', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      blockchains,
      walletSetId,
      count: 1,
      metadata: [{
        name: `agent-${agentId}`,
        refId: agentId,
      }],
      accountType: 'eoa',
      encryptedOrganizationSecret: encryptedSecret,
    }),
  });

  const wallets = result.data?.wallets || [];
  const primary = wallets[0];

  if (!primary) {
    throw new Error('Planbok returned no wallets');
  }

  return {
    walletId: primary.id,
    address: primary.address,
    publicKey: primary.publicKey,
    blockchain: primary.blockchain,
    allWallets: wallets.map(w => ({
      id: w.id,
      address: w.address,
      blockchain: w.blockchain,
    })),
  };
}

/**
 * List all wallets (optionally filtered)
 */
export async function listWallets(options = {}) {
  const params = new URLSearchParams();
  if (options.blockchain) params.set('blockchain', options.blockchain);
  if (options.refId) params.set('refId', options.refId);
  if (options.page) params.set('page', options.page);
  if (options.limit) params.set('limit', options.limit || 50);

  const result = await planbokFetch(`/v2/wallets?${params}`);
  return result.data || [];
}

/**
 * Get a specific wallet by ID
 */
export async function getWallet(walletId) {
  const result = await planbokFetch(`/v2/wallets/${walletId}`);
  return result.data;
}

/**
 * Get wallet token balances
 */
export async function getBalances(walletId) {
  const result = await planbokFetch(`/v2/wallets/${walletId}/balances`);
  return result.data || [];
}

// ── Tokens (Organization Token Registry) ────────────────────────

/**
 * List all tokens registered with this organization.
 * Per-organization scope — each org has its own registry.
 * Planbok's fee estimator and /balances endpoint only surface tokens that
 * appear here (plus chain natives). Custom ERC-20s on testnets must be
 * registered before contract-execution calls that touch them will succeed.
 */
export async function listTokens(options = {}) {
  const params = new URLSearchParams();
  if (options.blockchain) params.set('blockchain', options.blockchain);
  if (options.standard) params.set('standard', options.standard);
  if (options.page) params.set('page', options.page);
  if (options.limit) params.set('limit', options.limit || 100);
  const result = await planbokFetch(`/v2/tokens?${params}`);
  return result.data || [];
}

/**
 * Get metadata about supported chains / token standards Planbok knows about.
 * Useful to verify a given blockchain ID (e.g. ETH-SEPOLIA) is accepted.
 */
export async function getTokenMetadata() {
  const result = await planbokFetch('/v2/tokens/metadata');
  return result.data;
}

/**
 * Get details of a single registered token by its Planbok-assigned ID.
 */
export async function getToken(tokenId) {
  const result = await planbokFetch(`/v2/tokens/${tokenId}`);
  return result.data;
}

/**
 * Register a custom ERC-20 (or other standard) token with this organization.
 * Once registered, Planbok's balance endpoint and fee estimator will recognize
 * the token when used in contract-execution calls.
 *
 * @param {object} opts
 * @param {string} opts.blockchain - e.g. 'ETH-SEPOLIA'
 * @param {string} opts.standard   - e.g. 'erc20'
 * @param {string} opts.address    - contract address (required for erc20)
 * @param {string} opts.symbol     - ticker symbol
 * @param {number} opts.decimals   - token decimals
 * @param {string} [opts.name]     - display name (optional)
 */
export async function addToken({ blockchain, standard = 'erc20', address, symbol, decimals, name }) {
  const body = { blockchain, standard, symbol, decimals };
  if (address) body.address = address;
  if (name) body.name = name;
  const result = await planbokFetch('/v2/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return result.data;
}

/**
 * Remove a token from the organization's registry.
 */
export async function removeToken(tokenId) {
  const result = await planbokFetch(`/v2/tokens/${tokenId}`, { method: 'DELETE' });
  return result.data;
}

// ── Transactions ────────────────────────────────────────────────

/**
 * Transfer tokens from a wallet
 */
export async function executeTransfer({ walletId, destinationAddress, tokenId, amounts, feeLevel = 'medium' }) {
  const encryptedSecret = await encryptOrgSecret('sign');
  const result = await planbokFetch('/v2/organization/transactions/transfer', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      walletId,
      destinationAddress,
      tokenId,
      amounts: Array.isArray(amounts) ? amounts : [amounts.toString()],
      feeLevel,
      encryptedOrganizationSecret: encryptedSecret,
    }),
  });

  return {
    txId: result.data?.id,
    txHash: result.data?.transactionHash,
    status: result.data?.status,
    signature: result.data?.signature,
  };
}

/**
 * Estimate transfer fee
 */
export async function estimateFee({ walletId, destinationAddress, tokenId, amounts }) {
  const result = await planbokFetch('/v2/transactions/transfer/estimate-fee', {
    method: 'POST',
    body: JSON.stringify({
      walletId,
      destinationAddress,
      tokenId,
      amounts: Array.isArray(amounts) ? amounts : [amounts.toString()],
    }),
  });

  return result.data;
}

/**
 * Execute a smart contract function via MPC-signed transaction.
 * This is the key method for AutoSwap settlement — calls createOrder on-chain.
 */
export async function executeContract({
  walletId,
  contractAddress,
  abiFunctionSignature,
  abiParameters = [],
  amount,
  feeLevel = 'medium',
  refId,
}) {
  // Build-and-POST in a tight loop: we re-encrypt the org secret right before each
  // request so the payload timestamp is as fresh as possible, and we generate a new
  // idempotencyKey per attempt to avoid Planbok rejecting the retry as a duplicate.
  //
  // Retries up to 3 times on transient signing errors:
  //   - "Payload expired" / clock skew
  //   - upstream 5xx / network resets
  //   - 422 "Insufficient funds for transaction" when we KNOW the wallet was just funded
  //     on-chain (Planbok's fee estimator runs against its own node which can lag the
  //     canonical chain by a few seconds after a fresh deposit). Safe to retry because
  //     the first attempt errors at pre-flight fee estimation before anything is signed.
  //
  // Backoff: 500ms → 2s → 5s (~7.5s total ceiling) — plenty for estimator catch-up
  // without letting a genuine misconfiguration hang the settlement for long.
  const BACKOFF_MS = [500, 2000, 5000];
  let lastErr;
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    const encryptedSecret = await encryptOrgSecret('sign');
    const body = {
      idempotencyKey: randomUUID(),
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters: abiParameters.map(String),
      feeLevel,
      encryptedOrganizationSecret: encryptedSecret,
    };
    if (amount) body.amount = amount.toString();
    if (refId) body.refId = refId;

    try {
      const result = await planbokFetch('/v2/organization/transactions/contract-execution', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return {
        txId: result.data?.id,
        txHash: result.data?.transactionHash,
        status: result.data?.status,
        signature: result.data?.signature,
      };
    } catch (err) {
      lastErr = err;
      const msg = err.message || '';
      // Known-transient signing errors. Do NOT retry on allowance / revert errors —
      // those won't fix themselves. "Insufficient funds for transaction" is retryable
      // ONLY because we always fund the agent wallet before settlement — if the user's
      // funding tx failed silently upstream, we'd still waste at most ~7.5s before
      // surfacing the error.
      const transient = /Payload expired|Transaction signing failed|500 —|timeout|ETIMEDOUT|ECONNRESET|Insufficient funds for transaction/i.test(msg);
      const isLast = attempt === BACKOFF_MS.length - 1;
      if (!transient || isLast) throw err;
      console.warn(`[Planbok] executeContract transient error (attempt ${attempt + 1}/${BACKOFF_MS.length}), retrying in ${BACKOFF_MS[attempt]}ms: ${msg.slice(0, 160)}`);
      await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  throw lastErr;
}

/**
 * Estimate contract execution fee
 */
export async function estimateContractFee({ walletId, contractAddress, abiFunctionSignature, abiParameters = [], amount }) {
  const body = {
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters: abiParameters.map(String),
  };
  if (amount) body.amount = amount.toString();

  const result = await planbokFetch('/v2/transactions/contract-execution/estimate-fee', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return result.data;
}

/**
 * Call a view/read-only contract function (no signing, no gas)
 */
export async function callContractView({ walletId, contractAddress, abiFunctionSignature, abiParameters = [] }) {
  const result = await planbokFetch('/v2/transactions/contract-view/call', {
    method: 'POST',
    body: JSON.stringify({
      walletId,
      contractAddress,
      abiFunctionSignature,
      abiParameters: abiParameters.map(String),
    }),
  });

  return result.data?.result;
}

// ── Signing ─────────────────────────────────────────────────────

/**
 * Sign an arbitrary message
 */
export async function signMessage(walletId, message) {
  const result = await planbokFetch('/v2/organization/transactions/sign', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      walletId,
      message,
    }),
  });

  return result.data;
}

/**
 * Sign EIP-712 typed data
 */
export async function signTypedData(walletId, typedData) {
  const result = await planbokFetch('/v2/organization/transactions/sign-typed-data', {
    method: 'POST',
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      walletId,
      typedData,
    }),
  });

  return result.data;
}

// ── Transaction Management ──────────────────────────────────────

/**
 * Get transaction details
 */
export async function getTransaction(txId) {
  const result = await planbokFetch(`/v2/transactions/${txId}`);
  return result.data;
}

/**
 * List transaction history
 */
export async function listTransactions(options = {}) {
  const params = new URLSearchParams();
  if (options.walletIds) params.set('walletIds', options.walletIds);
  if (options.status) params.set('status', options.status);
  if (options.blockchain) params.set('blockchain', options.blockchain);
  if (options.page) params.set('page', options.page);
  if (options.limit) params.set('limit', options.limit || 20);

  const result = await planbokFetch(`/v2/transactions?${params}`);
  return result.data || [];
}

/**
 * Cancel a pending transaction
 */
export async function cancelTransaction(txId) {
  const result = await planbokFetch(`/v2/organization/transactions/${txId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey: randomUUID() }),
  });
  return result.data;
}

/**
 * Accelerate a pending transaction (bump gas)
 */
export async function accelerateTransaction(txId) {
  const result = await planbokFetch(`/v2/organization/transactions/${txId}/accelerate`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey: randomUUID() }),
  });
  return result.data;
}

// ── Health ───────────────────────────────────────────────────────

/**
 * Health check
 */
export async function healthCheck() {
  try {
    const result = await planbokFetch('/health');
    return result.healthy === true;
  } catch {
    return false;
  }
}

export { getBase as PLANBOK_BASE, getKey as PLANBOK_KEY, CHAIN_TO_PLANBOK };
