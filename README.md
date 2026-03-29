# Fold Backend API

A type-safe Hono backend for Fold decentralized memory stack. Built with Hono, Drizzle ORM, and Neon PostgreSQL, with Privy auth, Pinata IPFS relay, Polygon Amoy integration, and Stripe subscriptions.

## Features

- Privy JWT authentication with wallet-linked user identities
- Encrypted memory pointer storage using IPFS CIDs and manifest CIDs
- Memory, share, and subscription APIs for web3 mobile flows
- Quota and rate-limit middleware for upload and memory operations
- Blockchain status and admin metrics endpoints
- Expo push token registration and notification dispatch

## Tech Stack

- Framework: Hono
- Database: Neon PostgreSQL + Drizzle ORM
- Auth: Privy server auth
- Storage relay: Pinata IPFS API
- Chain client: viem + permissionless (Polygon Amoy)
- Payments: Stripe
- Runtime: Node.js + TypeScript

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill values.

```env
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:8081"
CONNECT_COOLDOWN_DAYS=30

PRIVY_APP_ID=
PRIVY_APP_SECRET=
PINATA_JWT=
CERAMIC_URL=https://ceramic-clay.3boxlabs.com
PIMLICO_API_KEY=
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
MEMORY_VAULT_ADDRESS=
PAYMASTER_ADDRESS=
PREMIUM_SBT_ADDRESS=
STORAGE_NFT_ADDRESS=
DEPLOYER_PRIVATE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PREMIUM_PRICE_ID=
ADMIN_WALLET_ADDRESS=
```

### 3. Push schema

```bash
npm run db:push
```

### 4. Run dev server

```bash
npm run dev
```

Server runs at `http://localhost:3000`.

## Core API Routes

- `/api/auth/verify`, `/api/auth/wallet-link`
- `/api/upload/ipfs`, `/api/upload/manifest`
- `/api/memories`, `/api/memories/:id`
- `/api/blockchain/record`, `/api/blockchain/status/:tx`
- `/api/share/memory`, `/api/share/received`, `/api/share/:id`
- `/api/subscription/checkout`, `/api/subscription/webhook`, `/api/subscription/status`
- `/api/config/push-token`
- `/api/admin/metrics`, `/api/admin/users`
- Existing routers retained: `/api/profile/*`, `/api/connect/*`, `/api/timeline/*`, `/api/user/*`

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run db:push
npm run db:studio
```

## License

MIT
