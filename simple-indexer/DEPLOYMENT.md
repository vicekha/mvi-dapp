# Production Deployment Guide

## 1. Containerization (Recommended)
This indexer is ready to be deployed using Docker. This ensures it runs the same way on your server as it does locally.

### Build the Image
```bash
docker build -t mvi-indexer .
```

### Run the Container
You must mount a volume to persist the `orders.json` database, otherwise you lose data on restart.

```bash
docker run -d \
  -p 42000:42000 \
  -v $(pwd)/data:/app/data \
  --name mvi-indexer \
  --restart always \
  mvi-indexer
```

## 2. Hosting Options

### Option A: Railway / Render (Easiest)
1. Push this `simple-indexer` folder to a GitHub repository.
2. Connect Railway/Render to the repo.
3. **Important**: Add a "Disk" or "Volume" service and mount it to `/app/data` so your database is saved.
4. Set the Start Command to `node server.js`.

### Option B: VPS (DigitalOcean / AWS EC2)
1. SSH into your server.
2. Install Docker.
3. Clone your repo.
4. Run the `docker run` command above.
5. Use Nginx and Certbot to add HTTPS (SSL) forwarding to port 42000.

## 3. Frontend Configuration
Once deployed, your indexer will have a public URL (e.g., `https://indexer.mvi-dapp.com`).

You must update your Frontend to use this URL instead of localhost.

**File:** `frontend/.env` (Create if missing)
```env
VITE_INDEXER_URL=https://indexer.mvi-dapp.com/graphql
```

**File:** `frontend/src/components/OrdersPanel.tsx`
Update the fetch URL to use the environment variable:

```typescript
const INDEXER_URL = import.meta.env.VITE_INDEXER_URL || 'http://localhost:42000/graphql';

// ... inside fetchOrders ...
const response = await fetch(INDEXER_URL, { ... });
```
