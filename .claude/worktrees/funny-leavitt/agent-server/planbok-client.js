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

  // Build the JSON payload — must include secret, timestamp, and context
  const payload = JSON.stringify({
    secret: orgSecretHex,
    timestamp: Date.now(),
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
