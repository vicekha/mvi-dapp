#!/usr/bin/env node
/**
 * Planbok API Integration Debugger
 * ─────────────────────────────────
 * Run: node planbok-debug.js
 *
 * Tests all possible Planbok API endpoints and auth patterns
 * to identify the correct configuration for wallet creation,
 * signing, and transaction execution.
 *
 * Current issue: POST /wallets returns 404
 * This script systematically tests endpoint variations to find
 * the working pattern.
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

const API_URL = process.env.PLANBOK_API_URL || 'https://api.planbok.io';
const API_KEY = process.env.PLANBOK_API_KEY || '';

console.log('═══════════════════════════════════════════════════════');
console.log('  PLANBOK API INTEGRATION DEBUGGER');
console.log('═══════════════════════════════════════════════════════');
console.log(`  API URL:  ${API_URL}`);
console.log(`  API Key:  ${API_KEY ? API_KEY.slice(0, 20) + '...' : 'NOT SET'}`);
console.log('═══════════════════════════════════════════════════════\n');

// ── Auth Patterns ──────────────────────────────────────────────

const AUTH_PATTERNS = [
  {
    name: 'Bearer token',
    headers: { Authorization: `Bearer ${API_KEY}` },
  },
  {
    name: 'X-API-Key header',
    headers: { 'X-API-Key': API_KEY },
  },
  {
    name: 'x-api-key header (lowercase)',
    headers: { 'x-api-key': API_KEY },
  },
  {
    name: 'Api-Key header',
    headers: { 'Api-Key': API_KEY },
  },
  {
    name: 'Basic auth',
    headers: { Authorization: `Basic ${Buffer.from(API_KEY).toString('base64')}` },
  },
  {
    name: 'Key in query (appended to URL)',
    headers: {},
    queryParam: `api_key=${API_KEY}`,
  },
];

// ── Endpoint Patterns ──────────────────────────────────────────

// Common REST patterns for MPC wallet APIs
const ENDPOINTS = {
  health: [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/v1/health' },
    { method: 'GET', path: '/api/v1/health' },
    { method: 'GET', path: '/status' },
    { method: 'GET', path: '/api/status' },
    { method: 'GET', path: '/' },
  ],
  wallets: [
    // Standard REST
    { method: 'POST', path: '/wallets', body: { chains: ['evm'] } },
    { method: 'POST', path: '/api/wallets', body: { chains: ['evm'] } },
    { method: 'POST', path: '/v1/wallets', body: { chains: ['evm'] } },
    { method: 'POST', path: '/api/v1/wallets', body: { chains: ['evm'] } },
    // With create suffix
    { method: 'POST', path: '/wallets/create', body: { chains: ['evm'] } },
    { method: 'POST', path: '/api/wallets/create', body: { chains: ['evm'] } },
    { method: 'POST', path: '/v1/wallets/create', body: { chains: ['evm'] } },
    // MPC-specific patterns
    { method: 'POST', path: '/mpc/wallets', body: { chains: ['evm'] } },
    { method: 'POST', path: '/mpc/create', body: { type: 'evm' } },
    { method: 'POST', path: '/api/mpc/wallets', body: { chains: ['evm'] } },
    // Wallet generation patterns
    { method: 'POST', path: '/wallet/generate', body: { blockchain: 'ethereum' } },
    { method: 'POST', path: '/api/wallet/generate', body: { blockchain: 'ethereum' } },
    { method: 'POST', path: '/wallets/generate', body: { chain: 'evm' } },
    // Account patterns
    { method: 'POST', path: '/accounts', body: { type: 'evm' } },
    { method: 'POST', path: '/api/accounts', body: { type: 'evm' } },
    { method: 'POST', path: '/v1/accounts', body: { chain: 'ethereum' } },
    // Key patterns
    { method: 'POST', path: '/keys', body: { curve: 'secp256k1' } },
    { method: 'POST', path: '/api/keys', body: { curve: 'secp256k1' } },
    { method: 'POST', path: '/keys/create', body: { algorithm: 'ecdsa', curve: 'secp256k1' } },
  ],
  listWallets: [
    { method: 'GET', path: '/wallets' },
    { method: 'GET', path: '/api/wallets' },
    { method: 'GET', path: '/v1/wallets' },
    { method: 'GET', path: '/api/v1/wallets' },
    { method: 'GET', path: '/mpc/wallets' },
    { method: 'GET', path: '/accounts' },
    { method: 'GET', path: '/api/accounts' },
    { method: 'GET', path: '/keys' },
    { method: 'GET', path: '/api/keys' },
  ],
  signing: [
    { method: 'POST', path: '/sign/message', body: { message: 'test' } },
    { method: 'POST', path: '/api/sign/message', body: { message: 'test' } },
    { method: 'POST', path: '/v1/sign', body: { message: 'test', type: 'message' } },
    { method: 'POST', path: '/mpc/sign', body: { data: 'test' } },
    { method: 'POST', path: '/wallets/sign', body: { message: 'test' } },
  ],
};

// ── Test Runner ────────────────────────────────────────────────

async function testEndpoint(method, path, body, headers, queryParam) {
  let url = `${API_URL}${path}`;
  if (queryParam) url += `?${queryParam}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(8000),
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    let responseBody;

    if (contentType.includes('json')) {
      responseBody = await res.json();
    } else {
      const text = await res.text();
      responseBody = text.slice(0, 200);
    }

    return {
      status: res.status,
      statusText: res.statusText,
      body: responseBody,
      ok: res.ok,
      headers: Object.fromEntries(res.headers.entries()),
    };
  } catch (err) {
    return {
      status: 0,
      statusText: err.message,
      body: null,
      ok: false,
      error: true,
    };
  }
}

function formatResult(result) {
  const icon = result.ok ? '✅' : result.status === 401 || result.status === 403 ? '🔒' : result.status === 404 ? '❌' : result.error ? '⚠️' : '❓';
  return `${icon} ${result.status} ${result.statusText}`;
}

// ── Phase 1: Find working health/root endpoint ─────────────────

async function phase1() {
  console.log('━━━ PHASE 1: Discover API root ━━━\n');

  for (const ep of ENDPOINTS.health) {
    const result = await testEndpoint(ep.method, ep.path, null, AUTH_PATTERNS[0].headers);
    const status = formatResult(result);
    console.log(`  ${ep.method} ${ep.path} → ${status}`);
    if (result.ok) {
      console.log(`    Response: ${JSON.stringify(result.body).slice(0, 150)}`);
    }
  }
  console.log('');
}

// ── Phase 2: Find correct auth pattern ─────────────────────────

async function phase2() {
  console.log('━━━ PHASE 2: Test auth patterns ━━━\n');

  // Use a simple GET endpoint for auth testing
  const testPaths = ['/wallets', '/api/wallets', '/v1/wallets', '/health', '/api/health'];

  for (const auth of AUTH_PATTERNS) {
    let found = false;
    for (const path of testPaths) {
      const result = await testEndpoint('GET', path, null, auth.headers, auth.queryParam);
      if (result.ok || result.status === 200) {
        console.log(`  ✅ ${auth.name} works on GET ${path}`);
        console.log(`    Response: ${JSON.stringify(result.body).slice(0, 150)}`);
        found = true;
        break;
      }
      if (result.status === 401 || result.status === 403) {
        // Auth endpoint exists but wrong credentials
        console.log(`  🔒 ${auth.name} → ${result.status} on GET ${path} (auth rejected)`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`  ❓ ${auth.name} → no matching endpoints responded`);
    }
  }
  console.log('');
}

// ── Phase 3: Find wallet creation endpoint ─────────────────────

async function phase3() {
  console.log('━━━ PHASE 3: Test wallet creation endpoints ━━━\n');

  // Test with all auth patterns on each endpoint
  for (const ep of ENDPOINTS.wallets) {
    // Try each auth pattern
    for (const auth of AUTH_PATTERNS) {
      const result = await testEndpoint(ep.method, ep.path, ep.body, auth.headers, auth.queryParam);

      if (result.ok) {
        console.log(`  ✅ FOUND! ${ep.method} ${ep.path} with ${auth.name}`);
        console.log(`    Body sent: ${JSON.stringify(ep.body)}`);
        console.log(`    Response:  ${JSON.stringify(result.body).slice(0, 300)}`);
        return { endpoint: ep, auth };
      }

      if (result.status === 401 || result.status === 403) {
        console.log(`  🔒 ${ep.method} ${ep.path} exists but auth failed (${auth.name}) → ${result.status}`);
        if (result.body) console.log(`    Error: ${JSON.stringify(result.body).slice(0, 150)}`);
      }

      if (result.status === 400 || result.status === 422) {
        console.log(`  📋 ${ep.method} ${ep.path} exists! Bad request body (${auth.name}) → ${result.status}`);
        if (result.body) console.log(`    Error: ${JSON.stringify(result.body).slice(0, 200)}`);
        console.log(`    Body sent: ${JSON.stringify(ep.body)}`);
        return { endpoint: ep, auth, needsBodyFix: true };
      }
    }
  }

  // If nothing worked with any auth, show all 404s (endpoint doesn't exist)
  console.log('\n  ❌ No wallet creation endpoint found with any auth pattern.');
  console.log('  Testing bare endpoints (no auth) for discovery:\n');

  for (const ep of ENDPOINTS.wallets) {
    const result = await testEndpoint(ep.method, ep.path, ep.body, {});
    if (result.status !== 404 && !result.error) {
      console.log(`  ${formatResult(result)} ${ep.method} ${ep.path}`);
      if (result.body) console.log(`    Response: ${JSON.stringify(result.body).slice(0, 150)}`);
    }
  }

  return null;
}

// ── Phase 4: Test list wallets ─────────────────────────────────

async function phase4() {
  console.log('━━━ PHASE 4: Test list wallets endpoints ━━━\n');

  for (const ep of ENDPOINTS.listWallets) {
    for (const auth of AUTH_PATTERNS.slice(0, 3)) { // Test top 3 auth patterns
      const result = await testEndpoint(ep.method, ep.path, null, auth.headers, auth.queryParam);

      if (result.ok) {
        console.log(`  ✅ ${ep.method} ${ep.path} (${auth.name})`);
        console.log(`    Response: ${JSON.stringify(result.body).slice(0, 200)}`);
        return;
      }
      if (result.status === 401 || result.status === 403) {
        console.log(`  🔒 ${ep.method} ${ep.path} exists, auth failed (${auth.name})`);
        break;
      }
    }
  }
  console.log('');
}

// ── Phase 5: OpenAPI / docs discovery ──────────────────────────

async function phase5() {
  console.log('━━━ PHASE 5: API documentation discovery ━━━\n');

  const docPaths = [
    '/docs', '/api/docs', '/swagger', '/api/swagger',
    '/openapi.json', '/api/openapi.json', '/swagger.json',
    '/api/swagger.json', '/v1/openapi.json', '/redoc',
    '/api-docs', '/api/api-docs', '/graphql',
  ];

  for (const path of docPaths) {
    const result = await testEndpoint('GET', path, null, AUTH_PATTERNS[0].headers);
    if (result.ok || result.status === 200 || result.status === 301 || result.status === 302) {
      console.log(`  ✅ ${path} → ${result.status}`);
      if (typeof result.body === 'string') {
        console.log(`    Content: ${result.body.slice(0, 200)}`);
      } else if (result.body) {
        console.log(`    Response: ${JSON.stringify(result.body).slice(0, 300)}`);
      }
    }
  }
  console.log('');
}

// ── Phase 6: Generate integration code ─────────────────────────

function phase6(walletResult) {
  console.log('━━━ PHASE 6: Integration Code ━━━\n');

  if (walletResult) {
    const { endpoint, auth, needsBodyFix } = walletResult;
    console.log('  Based on the discovery above, update planbok-client.js:');
    console.log('');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log(`  │ Wallet endpoint: ${endpoint.method} ${endpoint.path}`);
    console.log(`  │ Auth pattern:    ${auth.name}`);
    console.log(`  │ Request body:    ${JSON.stringify(endpoint.body)}`);
    if (needsBodyFix) {
      console.log(`  │ NOTE: Endpoint exists but returned 400/422.`);
      console.log(`  │ Check the error above for the correct body format.`);
    }
    console.log('  └─────────────────────────────────────────────────┘');
  } else {
    console.log('  No working endpoint found. Possible causes:');
    console.log('');
    console.log('  1. API URL is wrong — try:');
    console.log('     - https://api.planbok.io/v1');
    console.log('     - https://planbok.io/api');
    console.log('     - https://app.planbok.io/api');
    console.log('');
    console.log('  2. API key format is wrong — current key starts with:');
    console.log(`     "${API_KEY.slice(0, 30)}..."`);
    console.log('     Check if it needs to be split (e.g., client_id:secret)');
    console.log('');
    console.log('  3. The API requires OAuth2 or session-based auth');
    console.log('     (not just an API key)');
    console.log('');
    console.log('  4. The test key has no wallet creation permissions');
    console.log('');
    console.log('  Share this output with the Planbok team for debugging.');
  }
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  await phase1();
  await phase2();
  const walletResult = await phase3();
  await phase4();
  await phase5();
  phase6(walletResult);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  DEBUG COMPLETE');
  console.log('');
  console.log('  Share this full output with the Planbok founder.');
  console.log('  Key questions for them:');
  console.log('  1. What is the correct base URL for the API?');
  console.log('  2. What auth header format does the API expect?');
  console.log('  3. What is the wallet creation endpoint + body schema?');
  console.log('  4. Does the TEST_API_KEY have wallet creation perms?');
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
