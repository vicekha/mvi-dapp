# MVI DApp - Developer Handoff Package

## 🚀 Getting Started

This package contains the Smart Contracts (Foundry) and Frontend (React/Vite).

### 1. Prerequisites
- **Node.js** (v18+)
- **Foundry** (Forge) -> `curl -L https://foundry.paradigm.xyz | bash`
- **Git**

### 2. Setup Contracts (Backend)
Navigate to the `contracts` folder:
```bash
cd contracts
```

Install dependencies:
```bash
forge install
```

Setup Environment:
- Copy `.env.example` to `.env`
- Fill in your `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, etc.

Run Tests:
```bash
forge test
```

Deploy (Sepolia):
```bash
forge script script/DeploySepolia.s.sol:DeploySepolia --rpc-url $SEPOLIA_RPC_URL --broadcast --legacy
```

### 3. Setup Frontend
Navigate to the `frontend` folder:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Start Development Server:
```bash
npm run dev
```
Open [http://localhost:3001](http://localhost:3001)

### 4. Documentation
See the included `.md` files for details:
- `walkthrough.md`: detailed deployment validation steps.
- `implementation_plan.md`: architectural decisions.
- `task.md`: status of features.
