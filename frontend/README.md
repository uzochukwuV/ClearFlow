# ClearFlow Frontend

Vite + React 18 + React Router + TanStack Query + shadcn/ui (Tailwind).

Targets the ClearFlow backend (`/api/v1/*`, wallet-signature auth, Circle
developer-controlled wallets on Monad testnet).

## Setup

```bash
npm install
cp .env.example .env.local   # set VITE_API_URL
npm run dev
```

## Env

- `VITE_API_URL` — backend base URL (default `http://localhost:3000`).

## Scripts

- `npm run dev` — Vite dev server (proxies `/api` to backend).
- `npm run build` — production build.
- `npm run lint` — ESLint.
