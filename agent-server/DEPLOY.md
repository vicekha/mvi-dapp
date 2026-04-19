# AutoSwap Agent Server — Deploy Runbook

Hosted backend for `autoswap.pages.dev`. Fixes the broken marketplace by
exposing the agent API + WebSocket over a public URL.

## Railway (recommended, 10 min, free tier)

### 1. Push to GitHub

```bash
# from repo root
git add agent-server/ frontend/src/config/planbok.js
git commit -m "chore(agent-server): single-port HTTP+WS for hosted deploy"
git push
```

### 2. Create Railway project

1. Go to https://railway.app/new
2. "Deploy from GitHub repo" → pick this repo
3. **Root Directory:** `agent-server`
4. Railway detects Node via `package.json` + `railway.json`; uses `node server.js`

### 3. Set env vars (Railway → Variables tab)

Required:
```
ANTHROPIC_API_KEY=sk-ant-...
PLANBOK_API_KEY=...
PLANBOK_API_URL=https://api.planbok.io
AUTOSWAP_PRIVATE_KEY=0x...
AUTOSWAP_RPC_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com
AUTOSWAP_RPC_BASE_SEPOLIA=https://sepolia.base.org
```

**Do NOT set** `WS_PORT` — leave it unset so HTTP+WS share Railway's single port.

Railway injects `PORT` automatically.

### 4. Generate public domain

Railway dashboard → Settings → **Generate Domain**. You'll get something like:
```
autoswap-agent-server-production.up.railway.app
```

### 5. Verify

```bash
curl https://autoswap-agent-server-production.up.railway.app/api/health
# → {"status":"ok","anthropic":true,"planbok":...}
```

### 6. Wire frontend to hosted backend

In Cloudflare Pages dashboard → autoswap project → **Settings → Environment variables → Production**:

```
VITE_AGENT_API_URL=https://<your-railway-domain>/api
```

(`VITE_AGENT_WS_URL` is optional — frontend derives `wss://<domain>` from the API URL automatically.)

Then redeploy frontend:
```bash
cd frontend
npm run build
npm run deploy
```

### 7. Test live

Visit `https://autoswap.pages.dev/marketplace` → create an agent → WebSocket should connect → agents negotiate → settlement fires on Sepolia.

---

## Fly.io alternative

```bash
cd agent-server
fly launch --no-deploy
# accept Dockerfile detection, skip Postgres/Redis
fly secrets set ANTHROPIC_API_KEY=sk-ant-... PLANBOK_API_KEY=... AUTOSWAP_PRIVATE_KEY=0x...
fly deploy
```

Domain: `https://<app-name>.fly.dev`

---

## Troubleshooting

- **WebSocket fails to connect on production**: confirm `VITE_AGENT_API_URL` uses `https://` (not `http://`) so the derived `wss://` is correct.
- **CORS errors**: `server.js` already allows `*`. If you've locked it down, add your Pages domain.
- **422 "Insufficient funds" from Planbok**: master wallet needs more ETH on the chain being swept/traded.
- **Cold starts on Railway free tier**: first request after idle takes ~5s. Acceptable for demo; upgrade to Hobby ($5/mo) for always-on.
