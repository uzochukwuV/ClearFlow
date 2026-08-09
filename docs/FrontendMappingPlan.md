# ClearFlow Frontend → Backend Mapping Plan

> Status: **PLANNING ONLY — no implementation yet.**
> Source: the extracted Base44 export in `frontend/` (Vite + React + shadcn/ui).
> Target: the ClearFlow POF backend (`/api/v1/*`, wallet-signature auth, Circle wallets on Monad testnet).

This document analyses what the extracted frontend contains and maps each piece to
the real backend. It ends with a phased implementation plan and the key gaps to close.

---

## 1. What the extracted frontend is

A **Base44 app export** — a Vite + React 18 + React Router + TanStack Query +
shadcn/ui (Tailwind) application. It was built visually in the Base44 builder and
exported. Three things make it **not production-ready** as-is:

1. **The data layer is a stub.** `src/api/base44Client.js` is a one-liner that
   returns empty arrays / null for every call:
   ```js
   export const db = { auth: { isAuthenticated: async()=>false, me: async()=>null },
     entities: new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null,
       create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }, ... };
   ```
   Every page calls `db.entities.<Entity>.filter/create/get/update` — all no-ops.

2. **Auth is tied to the Base44 hosted platform.** `src/lib/AuthContext.jsx` talks
   to `/api/apps/public`, uses `X-App-Id` + `access_token` URL params
   (`src/lib/app-params.js`), and expects a hosted "public settings" endpoint.
   The backend has **none of this** — it uses wallet-signature auth.

3. **The wallet is fake.** `src/lib/wallet.jsx`'s `connect()` generates a random
   `0x…` address and stores it in localStorage; `sign()` returns a random
   130-char hex string. No MetaMask / WalletConnect / real signing.

So: **the UI shell, routing, page layouts, and shadcn components are reusable. The
data layer, auth, and wallet layer must be rebuilt** to target the ClearFlow backend.

### Tech stack (keep as-is)
| Layer | Choice | Notes |
|-------|--------|-------|
| Build | Vite | `vite.config.js` (remove Base44 plugin) |
| Framework | React 18 | `src/main.jsx` |
| Routing | react-router-dom v6 | `src/App.jsx` |
| Data | TanStack Query | `src/lib/query-client.js` — already present, perfect for REST polling |
| UI | shadcn/ui + Tailwind | `src/components/ui/*` — ~50 components, all reusable |
| Icons | lucide-react | via shadcn |

### Directory structure (extracted)
```
frontend/
├── src/
│   ├── api/base44Client.js      ← STUB — replace with real API client
│   ├── lib/
│   │   ├── AuthContext.jsx       ← Base44-hosted — replace with wallet auth
│   │   ├── wallet.jsx            ← FAKE — replace with real wallet (MetaMask)
│   │   ├── app-params.js         ← Base44 bootstrap — delete
│   │   ├── authReturnTo.js       ← open-redirect guard — keep (good utility)
│   │   ├── query-client.js       ← keep
│   │   ├── activity.jsx          ← ActivityLog helper — keep, rewire to backend
│   │   └── utils.js              ← keep (cn, formatters)
│   ├── components/
│   │   ├── ui/                   ← shadcn — keep all
│   │   ├── AppLayout.jsx         ← sidebar shell — keep, rewire nav + role
│   │   ├── AuthLayout.jsx        ← keep
│   │   ├── ProtectedRoute.jsx    ← keep, change auth check
│   │   ├── ActivityTimeline.jsx  ← keep, rewire to /deals/:id/timeline
│   │   ├── StatusStepper.jsx     ← keep, map statuses
│   │   └── ...
│   └── pages/                    ← see §3 mapping table
├── base44/entities/*.jsonc       ← entity schemas — reference only, delete
└── base44/config.jsonc           ← delete
```

---

## 2. The core architectural mismatch

| Concern | Frontend (extracted) | Backend (ClearFlow) | Resolution |
|---------|----------------------|---------------------|------------|
| **Auth model** | Email/password OAuth via Base44 hosted platform (`access_token`, `X-App-Id`) | **Wallet signature**: sign EIP-191 message → backend recovers address → no password | Replace `AuthContext` + `app-params` with wallet-connect auth; session = recovered wallet address (+ optional JWT issued by backend) |
| **Identity** | Just pick a role in onboarding | Cleanverse **A-Pass** KYC required (`/identity/onboard` takes `customerId`, `identityDataList`, `userType`) | Onboarding page must collect KYC fields + call `/identity/onboard`; role = `userType` |
| **Wallet** | `randomAddress()` / `randomSignature()` in `wallet.jsx` | Real EOA via MetaMask; must produce real EIP-191 (130-char) + EIP-712 signatures | Replace `wallet.jsx` with ethers v6 + `window.ethereum` provider (MetaMask). Sign real messages. |
| **Data access** | `db.entities.Deal.filter()` (stub Proxy) | REST `/api/v1/deals`, `/purchase-orders`, etc. with signature auth | Build a typed API client (`src/api/client.js`) + per-resource hooks (`useDeals`, `usePOs`…) backed by TanStack Query |
| **Chain** | n/a (no real chain) | **Monad testnet** (chainId 10143, USDC `0x534b…43A3`, RPC `https://rpc.ankr.com/monad_testnet`) | Add Monad network to the wallet provider; switch chain on connect. **Backend schema `chainId` defaults to 84532 (Base) — must change to 10143 (Monad)** (or pass explicitly). |
| **Admin actions** | Frontend signs admin signature with wallet | Admin is a **Circle developer-controlled wallet** — key held by Circle, **cannot sign with MetaMask**. `adminSignature` is now **optional**; backend signs server-side when absent. | Frontend must NOT require an admin signature field. Admin dashboard actions just call the endpoint; backend signs as admin. |
| **Funding** | Not implemented (stub) | Two paths: CRYPTO (investor sends USDC on-chain to deal wallet) or FIAT (Cleanverse ramp widget) | Contribute page must show deal wallet address + poll `/funding/contributions/:id` for CONFIRMED |

---

## 3. Page-by-page mapping (frontend route → backend endpoints)

Routes are defined in `src/App.jsx`. All backend endpoints are prefixed `/api/v1`.

### Public / auth
| Frontend route | Page file | What it does now | Backend target | Work needed |
|----------------|-----------|------------------|----------------|-------------|
| `/` | `Landing.jsx` | Marketing landing | (static, no API) | None — keep |
| `/login` | `Login.jsx` | Email/password form | **No email login** — wallet auth only | **Rebuild**: "Connect Wallet" → sign nonce → backend verifies → session. May not need a separate login page (connect from landing). |
| `/register` | `Register.jsx` | Email/password register | **No email register** | **Remove or repurpose** → redirect to onboarding |
| `/forgot-password` | `ForgotPassword.jsx` | Email reset | n/a | **Delete** (no passwords) |
| `/reset-password` | `ResetPassword.jsx` | Email reset | n/a | **Delete** |
| `/onboarding` | `Onboarding.jsx` | Pick role (BUYER/SUPPLIER/INVESTOR) | `POST /identity/onboard` (signature, message, chain, userType, customerId, identityDataList) | **Rebuild**: collect KYC fields (idType, fullName, issuingCountryISO2) + customerId + userType; sign EIP-191 message; call `/identity/onboard`. Then `POST /identity/status` to poll A-Pass. |

### App shell
| Route | Page | Now | Backend | Work |
|-------|------|-----|---------|------|
| `/app` | `Dashboard.jsx` | Aggregated stats (stub) | `GET /dashboard/admin/:address` (admin), `GET /portfolio/my/positions` (investor), `GET /deals-discovery/open` | Rewire per-role: admin sees platform stats; investor sees portfolio; buyer/supplier see their deals/orders |
| (layout) | `AppLayout.jsx` | Sidebar nav by role | — | Keep shell; nav items gated by `clearflowRole` (BUYER/SUPPLIER/INVESTOR/ADMIN) |
| (guard) | `ProtectedRoute.jsx` | Checks Base44 auth | — | Change to check wallet connected + onboarded (A-Pass active) |

### Orders (Purchase Orders)
| Route | Page | Now (stub) | Backend | Work |
|-------|------|------------|---------|------|
| `/app/orders` | `PurchaseOrders.jsx` | `db.entities.PurchaseOrder.filter()` (buyer view) | `GET /purchase-orders/buyer/:address` | Rewire to buyer's POs |
| `/app/orders/new` | `CreatePO.jsx` | Form: supplierAddress, poReference, amount, currency, quantity, deliveryDate, description; `db.entities.PurchaseOrder.create()` | `POST /purchase-orders` (`createPORequestSchema`: poSignature EIP-712, buyerAddress, supplierAddress, amount, currency, quantity, deliveryDate, chainId) | **Add EIP-712 signing**: backend generates canonical PO + hash → buyer signs → submit. Form fields mostly match; add real wallet sign. |
| `/app/orders/:id` | `OrderDetail.jsx` | `db.entities.PurchaseOrder.get(id)` | `GET /purchase-orders/:id` (PO detail); `POST /purchase-orders/:id/sign` (supplier signs) | Rewire GET; add "Supplier Sign" action → EIP-712 sign → `POST /:id/sign` |
| `/app/orders/supplier` | `SupplierOrders.jsx` | POs filtered to supplier | `GET /purchase-orders/supplier/:address` | Rewire |

### Deals
| Route | Page | Now (stub) | Backend | Work |
|-------|------|------------|---------|------|
| `/app/deals` | `MyDeals.jsx` | `db.entities.Deal.filter()` | `GET /deals/:dealId` / `GET /deals-discovery/open` + filter by buyer/investor | Rewire — role-aware: buyer sees own deals; investor sees contributed deals |
| `/app/deals/new` | `CreateDeal.jsx` | Form: select PO, targetAmount, minimumAmount, yield, fundingDeadline, deliveryDeadline, eligibleCountries; `db.entities.Deal.create()` | `POST /deals` (createDealSchema: poId, targetAmount, yieldPercent, fundingDeadline, deliveryDeadline, eligibleCountries, chainId) | Rewire: fetch buyer's signed POs → select one → fill deal terms → submit. Form fields match well. |
| `/app/deals/discover` | `Discover.jsx` | `db.entities.Deal.filter({status:'OPEN'})` | `GET /deals-discovery/open` | Rewire — list open deals for investors |
| `/app/deals/discover/:dealId` | `Contribute.jsx` | Form: amount, paymentMethod (CRYPTO/FIAT); `db.entities.Contribution.create()` | `POST /deals/:dealId/contribute` (contributeRequestSchema: investorSignature, investorMessage, amount, paymentMethod, [adminSignature optional], fiatCurrency?, partnerCustomerId?, mintTokensOnConfirm?) | **Key page.** Investor signs EIP-712 → submit (NO admin sig needed — backend signs). CRYPTO: show deal wallet address + poll `GET /funding/contributions/:contributionId`. FIAT: open ramp widget (`POST /ramp/fiat-ramp/widget`). |
| `/app/deals/:dealId` | `DealDetail.jsx` | `db.entities.Deal.get(id)` + contributions + timeline | `GET /deals/:dealId`, `GET /deals/:dealId/timeline`, `GET /deals/:dealId/summary`, `GET /deals/:dealId/status` | Rewire — show deal status, contributions, timeline |
| `/app/deals/admin` | `AdminDeals.jsx` | All deals (admin) | `GET /dashboard/admin/:address` or list all | Rewire — admin sees all deals |
| `/app/deals/admin/:dealId` | `AdminDealDetail.jsx` | Deal detail + admin actions (release payout, etc.) | `POST /settlement/deals/:dealId/payout-release` (supplierSignature required; adminSignature OPTIONAL — backend signs); `POST /deals/:dealId/settle`; `POST /deals/:dealId/confirm-delivery`; `POST /deals/:dealId/repay` | **Admin actions don't need admin signing** — just call endpoints. Payout-release still needs supplier signature. |

### Investor
| Route | Page | Now (stub) | Backend | Work |
|-------|------|------------|---------|------|
| `/app/portfolio` | `Portfolio.jsx` | `db.entities.Contribution.filter()` for investor | `GET /portfolio/my/positions` (auth by wallet) | Rewire — investor's positions/holdings |
| `/app/claims` | `Claims.jsx` | List claimable contributions + claim action | `GET /claims/investor/:address` (claimable); `POST /claims/deals/:dealId/investor/:address/claim` | Rewire — list ready-to-claim + claim button → signs? (check if claim needs sig) |

### Supplier
| Route | Page | Now (stub) | Backend | Work |
|-------|------|------------|---------|------|
| `/app/payouts` | `Payouts.jsx` | Supplier payouts list | `GET /settlement/deals/:dealId/payouts` (per deal) or supplier-scoped list | Rewire — supplier sees payouts to their address |

---

## 4. Data model mapping (frontend entity → backend)

The `base44/entities/*.jsonc` schemas map cleanly to the backend Prisma models.

| Frontend entity | Backend model | Key field deltas |
|-----------------|---------------|------------------|
| `User` | `User` (walletAddress, userType) | Frontend has `role` (admin/user) + `clearflowRole` (BUYER/SUPPLIER/INVESTOR/ADMIN). Backend: `userType` enum BUYER/SUPPLIER/INVESTOR/PLATFORM. Map `clearflowRole` → `userType`. |
| `PurchaseOrder` | `PurchaseOrder` + `POSignature` | Frontend has `buyerSignature`/`supplierSignature` flat. Backend splits into `POSignature` rows (signer, signature, signedAt). PO status enum matches. Backend adds `advanceAmount`, `chainId`, `poHash`. |
| `Deal` | `Deal` | Fields match well (targetAmount, yield, fundingDeadline, dealWalletAddress, supplierAddress, status). Backend adds `circleWalletId`, `chainId`, `atokenSymbol`. **Status enums differ slightly** — see §5. |
| `Contribution` | `Contribution` + `Transaction` | Frontend has `txHash`, `tokenAmount`, `claimTxHash`. Backend: `Transaction` model holds txHash; `Contribution` has `paymentMethod`, `status`. Map 1:1 with renames. |
| `ActivityLog` | `DealEvent` / `SettlementEvent` | Frontend: flat `ActivityLog` (entityType, action, actorAddress, actorRole). Backend: `DealEvent` + `SettlementEvent` separate tables. `GET /deals/:dealId/timeline` returns a unified timeline. |

---

## 5. Status enum mapping

### Deal status
| Frontend (entity) | Backend | Notes |
|-------------------|---------|-------|
| `OPEN` | `OPEN` | ✅ match |
| `FUNDED` | `FUNDING_COMPLETE` | rename |
| `PAYOUT_RELEASED` | `SUPPLIER_PAID` | rename |
| `DELIVERY_CONFIRMED` | `DELIVERY_CONFIRMED` | ✅ match |
| `AWAITING_REPAYMENT` | `REPAYMENT_PENDING` | rename |
| `READY_FOR_DISTRIBUTION` | `READY_FOR_DISTRIBUTION` | ✅ match |
| `SETTLED` | `COMPLETED` | rename |

→ `StatusStepper.jsx` must map backend statuses to display steps.

### PO status
| Frontend | Backend |
|----------|---------|
| `PENDING_SUPPLIER_SIGNATURE` | `PENDING_SUPPLIER_SIGNATURE` |
| `SIGNED` | `SIGNED` |
| `DEAL_CREATED` | `DEAL_CREATED` |
| `FULFILLED` | `FULFILLED` |

✅ PO statuses match.

### Contribution status
| Frontend | Backend |
|----------|---------|
| `PENDING` | `PENDING` |
| `CONFIRMED` | `CONFIRMED` |
| `FAILED` | `FAILED` |
| `REFUNDED` | `REFUNDED` |
| `CLAIMED` | `CLAIMED` |

✅ Match.

---

## 6. Signature flows — what the frontend must sign

The backend is signature-heavy. The frontend wallet layer must produce real
EIP-191 (130-char `0x…`) and EIP-712 signatures. Summary of which page signs what:

| Action | Page | Signature type | Who signs | Backend verify |
|--------|------|----------------|-----------|----------------|
| Onboard (A-Pass) | Onboarding | EIP-191 message | User | `POST /identity/onboard` → recover address |
| Create PO | CreatePO | EIP-712 canonical PO | Buyer | `POST /purchase-orders` → `poSignature` |
| Sign PO | OrderDetail | EIP-712 canonical PO | Supplier | `POST /purchase-orders/:id/sign` → `poSignature` |
| Create deal | CreateDeal | (none, or intent) | Buyer | `POST /deals` (poId already signed) |
| Contribute | Contribute | EIP-712 (investor proves wallet) | Investor | `POST /deals/:dealId/contribute` → `investorSignature` |
| **Admin approval** | (admin pages) | **NONE** | **Backend signs** | `adminSignature` is OPTIONAL — backend signs via Circle admin wallet |
| Payout release | AdminDealDetail | EIP-712 PO | Supplier | `POST /settlement/.../payout-release` → `supplierSignature` (admin sig optional) |
| Claim | Claims | (verify if needed) | Investor | `POST /claims/.../claim` |
| Freeze/unfreeze | (admin) | EIP-191 | Admin? | Backend now signs as admin (Circle wallet) — frontend just calls |

**Critical**: the frontend must NOT prompt the admin to sign. The admin wallet is a
Circle developer-controlled wallet — its key is held by Circle and cannot sign via
MetaMask. All admin-approval fields are optional; the backend signs server-side.

---

## 7. Implementation plan (phased, not started)

### Phase F0: Strip Base44, set up real client
- Remove `base44/` dir, `src/api/base44Client.js`, `src/lib/app-params.js`, Base44 vite plugin.
- Create `src/api/client.js` — axios instance, `baseURL = VITE_API_URL` (default `http://localhost:3000/api/v1`), attach wallet-signature auth header interceptor.
- Create `src/api/resources/` — one module per resource (`deals.js`, `purchaseOrders.js`, `contributions.js`, `identity.js`, `settlement.js`, `portfolio.js`, `claims.js`, `dashboard.js`).
- Create React Query hooks: `useDeals`, `useCreateDeal`, `useContribute`, etc.

### Phase F1: Real wallet connection (replaces `wallet.jsx`)
- Install `ethers` v6 (matches backend).
- `WalletProvider`: `connect()` → `window.ethereum.request({ method: 'eth_requestAccounts' })`, ensure Monad testnet (chainId 10143) — `wallet_switchEthereumChain` / `wallet_addEthereumChain` with RPC `https://rpc.ankr.com/monad_testnet`.
- `signMessage(message)` → `window.ethereum.request({ method: 'personal_sign', params: [message, address] })` → returns real 130-char EIP-191 sig.
- `signTypedData(domain, types, value)` → `eth_signTypedData_v4` for EIP-712 (PO signing).
- Persist address in localStorage; emit connect/disconnect events.

### Phase F2: Wallet auth (replaces `AuthContext.jsx`)
- On wallet connect → request a nonce from backend (or sign a standard login message) → call identity status (`POST /identity/status` or `GET /identity/:address`) → if onboarded, set `user = { address, clearflowRole }`; if not, redirect to `/onboarding`.
- `ProtectedRoute` checks: wallet connected + onboarded.
- Remove email/password pages (`Login`, `Register`, `ForgotPassword`, `ResetPassword`) OR repurpose `Login` as "Connect Wallet" only.

### Phase F3: Onboarding (A-Pass KYC)
- Rebuild `Onboarding.jsx`: collect `userType` (role), `customerId`, `identityDataList` (idType, fullName, issuingCountryISO2).
- Sign EIP-191 message → `POST /identity/onboard`.
- Poll `POST /identity/status` until A-Pass active.
- Store role → drives `AppLayout` nav.

### Phase F4: Orders pages
- `PurchaseOrders` / `SupplierOrders` → wire to `GET /purchase-orders/buyer/:address` / `supplier/:address`.
- `CreatePO` → form → backend generates canonical PO + hash (need a `GET /purchase-orders/hash` or compute client-side) → buyer EIP-712 sign → `POST /purchase-orders`.
- `OrderDetail` → wire GET + supplier "Sign PO" action → `POST /purchase-orders/:id/sign`.

### Phase F5: Deals pages
- `MyDeals` / `Discover` → wire to deals-discovery + deal endpoints.
- `CreateDeal` → fetch signed POs → select → form → `POST /deals`.
- `DealDetail` → wire deal + timeline + summary.
- `Contribute` → investor EIP-712 sign → `POST /deals/:dealId/contribute`. CRYPTO path: show `dealWalletAddress` + USDC amount → poll `GET /funding/contributions/:contributionId`. FIAT path: `POST /ramp/fiat-ramp/widget` → open widget URL.

### Phase F6: Admin pages
- `AdminDeals` / `AdminDealDetail` → wire to dashboard admin endpoints.
- Admin actions (payout release, settle, confirm delivery, repay) → call settlement endpoints. **No admin signing UI** — backend signs as admin.
- Payout release needs supplier signature → supplier signs (or admin triggers supplier sign flow).

### Phase F7: Investor + Supplier pages
- `Portfolio` → `GET /portfolio/my/positions`.
- `Claims` → `GET /claims/investor/:address` + `POST /claims/.../claim`.
- `Payouts` → settlement payouts for supplier.

### Phase F8: Status mapping + polish
- Update `StatusStepper` with backend status enums (§5).
- Update `ActivityTimeline` to consume `/deals/:id/timeline` shape.
- Fix `chainId` defaults (backend schemas default to 84532/Base — change to 10143/Monad, or always pass explicitly from frontend).

---

## 8. Backend changes needed to support the frontend

These are backend-side gaps discovered during the mapping (separate from frontend work):

1. **`chainId` defaults are Base (84532), not Monad (10143).** Update in `purchaseOrder/schemas.ts`, `deal/schemas.ts` — or make `chain` derive from `MONAD_RPC_URL`. (Frontend will also pass 10143 explicitly.)
2. **No nonce/login endpoint.** The frontend needs a way to "log in" with a wallet. Options: (a) a `POST /identity/nonce` returning a challenge to sign, or (b) any signed call acts as login. Currently `onboard` + `status` are the only signed entry points. Consider a lightweight `POST /auth/login` that signs a standard message and returns a session token/JWT.
3. **PO hash generation.** `CreatePO` needs the canonical PO hash to sign with EIP-712. Either the backend exposes `POST /purchase-orders/hash` (returns hash + EIP-712 payload) or the frontend computes the canonical hash with the same algorithm the backend uses. Recommend a backend endpoint to avoid hash-algorithm drift.
4. **Supplier-scoped payouts list.** `Payouts.jsx` (supplier) needs a list endpoint. Currently payouts are per-deal (`GET /settlement/deals/:dealId/payouts`). Add `GET /settlement/supplier/:address/payouts` or similar.
5. **Dashboard role-awareness.** `Dashboard.jsx` needs role-aware data: `GET /dashboard/admin/:address` exists for admin; need investor/buyer/supplier equivalents or use existing portfolio/orders endpoints.

---

## 9. What can be reused as-is (no changes)

- All `src/components/ui/*` (shadcn — ~50 components).
- `src/lib/utils.js` (cn, formatters).
- `src/lib/query-client.js` (TanStack Query setup).
- `src/lib/authReturnTo.js` (open-redirect guard — good utility).
- `src/components/ScrollToTop.jsx`, `GoogleIcon.jsx`, layout shells.
- `src/index.css`, `tailwind.config.js`, `postcss.config.js`.
- Routing structure in `src/App.jsx` (keep routes, change auth gate).
- Page layouts / component composition (keep JSX structure, swap data calls).

---

## 10. Summary

The extracted frontend is a **well-structured UI shell with a fake data/auth/wallet
layer**. Roughly **70% of the code (UI components, layouts, routing, forms) is
reusable**; **30% (api client, auth, wallet, page data-wiring) must be rebuilt** to
target the ClearFlow backend. The entity models and page structure already mirror
the backend's domain (PO → Deal → Contribution → Settlement), so the mapping is
mostly mechanical rewiring plus three substantive rebuilds:

1. **Wallet layer** — real MetaMask + ethers, Monad testnet, EIP-191/EIP-712 signing.
2. **Auth layer** — wallet-signature auth replacing email/password OAuth.
3. **API layer** — typed REST client + React Query hooks replacing the stub `db`.

Plus one important behavioural change: **admin actions no longer require a
client-side admin signature** — the backend signs with the Circle admin wallet.
