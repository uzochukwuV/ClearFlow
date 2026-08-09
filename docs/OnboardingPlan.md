# Onboarding Implementation Plan

> Status: **PLANNING — no implementation yet.**
> Target: rewrite `src/pages/Onboarding.jsx` to drive the real Cleanverse A-Pass
> KYC flow via the backend `/identity/onboard` + `/identity/status` endpoints.

This plan analyses the current onboarding page, the backend identity flow it must
target, the gaps between them, and the exact implementation steps.

---

## 1. Current state of `Onboarding.jsx`

A 3-step wizard (connect wallet → pick role → profile), all backed by the stub
`db` (no real backend calls):

| Step | What it does | Data collected | Backend call |
|------|--------------|----------------|--------------|
| 0 | Connect wallet | wallet address | `useWallet().connect()` (✅ real, already rewired) |
| 1 | Pick role | `selectedRole` ∈ {BUYER, SUPPLIER, INVESTOR, ADMIN} | none |
| 2 | Profile form | `name`, `email` | `db.auth.updateMe({ full_name, clearflowRole })` ← **stub, no-op** |

On finish: `persistRole(selectedRole)` (localStorage only) → navigate to `/app`.

### What's wrong
1. **No KYC.** Collects name + email; the backend needs `customerId` + `identityDataList` (id type, full name, issuing country) to issue a Cleanverse A-Pass.
2. **No signature.** The backend recovers the wallet from an EIP-191 signature over an `ONBOARD:<timestamp>` message. The page never signs.
3. **No backend call.** `db.auth.updateMe` is a stub. The real call is `POST /identity/onboard`.
4. **No status polling.** Onboarding returns `status: 'PENDING'`; the A-Pass activates asynchronously. The page must poll `/identity/status` until active.
5. **`ADMIN` is not a self-onboardable role.** The backend `userType` enum is `BUYER | SUPPLIER | INVESTOR | PLATFORM`. The admin is a Circle developer-controlled wallet configured via env (`CLEARFLOW_ADMIN_WALLET`), not a self-service role. Offering ADMIN in the picker is incorrect.
6. **Auth gate doesn't check A-Pass.** `ProtectedRoute` only checks "wallet connected", not "A-Pass active", so an un-onboarded user can reach `/app`.

---

## 2. Backend identity flow (the target)

### `POST /api/v1/identity/onboard`
Request body (validated by `onboardRequestSchema`):
```jsonc
{
  "signature": "0x...",          // EIP-191, 130 hex chars — signs `message`
  "message": "ONBOARD:169123...", // authMessages.onboard()
  "chain": "monad",              // ⚠ enum currently missing 'monad' — see §4
  "userType": "BUYER",           // BUYER | SUPPLIER | INVESTOR | PLATFORM
  "customerId": "CF1A2B3C4D5E6", // 12+ chars, alphanumeric only
  "identityDataList": [          // optional but recommended (drives country tags + tier)
    {
      "idType": "PASSPORT",
      "fullName": "Jane Doe",
      "issuingCountryISO2": "US"
    }
  ]
}
```
Response (201):
```jsonc
{ "success": true, "data": { "apassId", "apassAddress", "status": "PENDING", "walletAddress" } }
```

The backend:
1. Verifies the EIP-191 signature → recovers `walletAddress`.
2. Calls Cleanverse `POST /generate_apass` with `{ customerId, wallet:{address,chain}, identityDataList, expirationTime }`.
3. Upserts a `User` row (`apassStatus = 'PENDING'`).
4. Returns the A-Pass record. Activation is async (webhook or poll).

### `POST /api/v1/identity/status`
Request:
```jsonc
{
  "signature": "0x...",                          // EIP-191 over authMessages.status(walletAddress)
  "message": "STATUS:wallet:0x...:169123...",
  "walletAddress": "0x..."                        // must match the signature's signer
}
```
Response:
```jsonc
{ "success": true, "data": { "walletAddress", "registered": true, "apassId", "status", "tier", "countries", "expirationTime" } }
```
A-Pass status values (from Cleanverse `query_apass`): `1 = active`, `2 = frozen`
(numeric → backend stores as string). The backend's `apassStatus` starts as
`'PENDING'` and updates to the Cleanverse status on query.

### Cleanverse chain support
`generate_apass` accepts (case-insensitive): `solana, base, avalanche, arbitrum,
ethereum, polygon, bsc, monad, hashkey, platon`. **Monad IS supported.**

---

## 3. Data mapping: frontend form → backend body

| Frontend field | Backend field | Source / notes |
|----------------|---------------|----------------|
| (wallet address) | `signature` + `message` | `useWallet().sign(authMessages.onboard())` → EIP-191 |
| (auto-derived) | `chain` | `'monad'` (constant — platform is Monad testnet) |
| role picker | `userType` | BUYER / SUPPLIER / INVESTOR (drop ADMIN) |
| (auto-generated) | `customerId` | `"CF" + wallet.slice(2,8) + timestamp-base36` → 12+ alphanumeric |
| KYC form: id type | `identityDataList[].idType` | PASSPORT / ID_CARD / DRIVER_LICENSE / RESIDENCE_PERMIT |
| KYC form: full name | `identityDataList[].fullName` | text input |
| KYC form: country | `identityDataList[].issuingCountryISO2` | ISO 3166-1 alpha-2 select |

The `name`/`email` fields the current form collects are **not used** by the
onboard endpoint. Email can be kept as an optional local profile field (stored
client-side, or future backend extension), but it's not part of A-Pass issuance.
The `fullName` lives inside `identityDataList`.

---

## 4. Backend gap to fix first

`src/services/auth/schemas.ts` `onboardRequestSchema` (and `statusRequestSchema`,
`verifyRequestSchema`, `freezeRequestSchema`, `unfreezeRequestSchema`) have:
```ts
chain: z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana'])
```
**`monad` is missing.** Cleanverse supports it, and `CLEANVERSE_DEFAULT_CHAIN`
in `.env` is set to monad. Add `'monad'` to all these enums (default should also
shift to `'monad'`). This is a one-line-per-schema backend change, prerequisite
to the frontend work.

---

## 5. Implementation plan (phased)

### Phase O0 — Backend: add `monad` to chain enums
- Edit `src/services/auth/schemas.ts`: add `'monad'` to `onboardRequestSchema`,
  `statusRequestSchema`, `verifyRequestSchema`, `freezeRequestSchema`,
  `unfreezeRequestSchema` chain enums; change `.default('polygon')` → `.default('monad')`.
- Verify `tsc --noEmit` passes.

### Phase O1 — KYC data collection (rewrite step 2 of the wizard)
Replace the name/email form with a KYC form:
- **Full name** (text) → `identityDataList[0].fullName`
- **ID type** (Select: PASSPORT / ID_CARD / DRIVER_LICENSE / RESIDENCE_PERMIT) → `identityDataList[0].idType`
- **Issuing country** (Select: ISO alpha-2 — US, GB, SG, AE, etc., or a searchable combobox) → `identityDataList[0].issuingCountryISO2`
- **Optional email** (text, stored locally only — not sent to backend)
- `customerId` is **auto-generated** (not user-facing): `"CF" + address.slice(2,10).toUpperCase() + Date.now().toString(36).toUpperCase().slice(-4)` → 14 chars, alphanumeric.
- Use existing shadcn `Select`, `Input`, `Label`, `Form` components.
- Validation: fullName required, idType required, country required. Disable "Submit" until valid.

### Phase O2 — Signing + onboard call
On "Submit":
1. Build the message: `const message = authMessages.onboard();` (from `src/lib/signing.js`).
2. Sign with the connected wallet: `const signature = await sign(message);` (from `useWallet()`).
3. Call the `useOnboardIdentity` hook (already implemented in `src/api/hooks.js`):
   ```js
   await onboard.mutateAsync({
     params: { userType: selectedRole, customerId, identityDataList: [{ idType, fullName, issuingCountryISO2 }] },
     signer: sign, // useWallet().sign
   });
   ```
   The hook's `identity.onboardIdentity()` builds the `withAuth` config, signs, and POSTs to `/identity/onboard`.
4. On success → `apassId`, `status: 'PENDING'` → advance to step 3 (status polling).
5. On error → toast + stay on step 2. Handle specific errors: signature rejection (user dismissed MetaMask), 401 (invalid sig), 400 (Cleanverse rejection — show `error.message`).

### Phase O3 — Status polling
After onboard returns PENDING:
- Show a "Verifying your identity…" step with a spinner + the `apassId`.
- Poll `POST /identity/status` every 3s (max ~60s / 20 attempts) using the
  `useIdentityStatus` mutation:
  ```js
  const result = await status.mutateAsync({ walletAddress: address, signer: sign });
  ```
- Terminal states:
  - `status === '1'` / `'ACTIVE'` / `registered && apassId` → success → persist role → navigate `/app`.
  - `status === '2'` / `'FROZEN'` → blocked toast (contact admin).
  - Timeout (still PENDING after 60s) → soft-success: persist role, navigate `/app`, show a "verification still pending" banner (the A-Pass may activate later via webhook; the user can still browse).
- The backend's `getStatus` queries Cleanverse `query_apass` on each call, so polling reflects real activation.

### Phase O4 — Auth gate: check A-Pass status
Update `AuthContext` + `ProtectedRoute` so the auth check is:
1. Wallet connected? (✅ already)
2. A-Pass active? — call `/identity/status` on mount when a wallet is connected.
   - Store `onboarded: boolean` + `apassStatus` in the auth context.
   - `ProtectedRoute`: if wallet connected but not onboarded → redirect to `/onboarding`.
   - If onboarded → allow through; expose `user.clearflowRole` + `user.apassTier` for role-gated nav.
- This replaces the placeholder `checkUserAuth` in the current AuthContext.

### Phase O5 — Role persistence + redirect
- On success, `persistRole(selectedRole)` (already in `useWallet` → localStorage).
- Also store the A-Pass result (`apassId`, `tier`, `countries`) in AuthContext user state.
- Navigate to `/app` (Dashboard reads role + onboarded status to render the right view).
- Remove the `ADMIN` option from the role picker. Admin access is env-configured,
  not self-service. (If the connected wallet matches `CLEARFLOW_ADMIN_WALLET`, the
  backend/dashboard can elevate automatically — no onboarding step needed.)

---

## 6. Page structure (rewritten `Onboarding.jsx`)

```
Step 0: Connect wallet           (existing — keep, already real)
  └─ useWallet().connect() → ensureMonadTestnet()

Step 1: Choose role              (existing — modify)
  └─ BUYER / SUPPLIER / INVESTOR only (drop ADMIN)
  └─ onSelect → setStep(2)

Step 2: Identity verification    (NEW — replaces name/email)
  └─ Full name (Input)
  └─ ID type (Select: PASSPORT/ID_CARD/DRIVER_LICENSE/RESIDENCE_PERMIT)
  └─ Issuing country (Select: ISO alpha-2)
  └─ [optional] Email (Input, local only)
  └─ Submit → sign ONBOARD message → POST /identity/onboard → setStep(3)

Step 3: Verifying                (NEW)
  └─ Spinner + apassId
  └─ Poll POST /identity/status every 3s
  └─ On ACTIVE → persistRole → navigate('/app')
  └─ On FROZEN → error state
  └─ On timeout → soft-success + banner
```

### Components used (all already exist)
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Input`, `Label`, `Button`
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (shadcn)
- `Loader2`, `CheckCircle2`, `ShieldCheck`, `ArrowRight` (lucide)
- `useToast` (feedback)
- `useWallet()` (connect, sign, address, shortAddr, setRole)
- `useOnboardIdentity`, `useIdentityStatus` (from `src/api/hooks.js`)

### New helper: country list
A small `src/lib/countries.js` with the ISO 3166-1 alpha-2 codes + names for the
Select dropdown (US, GB, SG, AE, CN, HK, JP, DE, FR, …). Keep it to ~30 common
ones to start; expandable.

### New helper: customerId generator
In `src/lib/identity.js`:
```js
export function generateCustomerId(walletAddress) {
  const slice = walletAddress.slice(2, 10).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `CF${slice}${ts}`; // 14 chars, alphanumeric
}
```

---

## 7. Error handling matrix

| Scenario | Detection | UX |
|----------|-----------|-----|
| No MetaMask | `useWallet().hasWallet === false` | Step 0 shows "Install MetaMask" link |
| Wrong chain | `ensureMonadTestnet` fails / user rejects switch | Toast: "Switch to Monad Testnet to continue" |
| User rejects sign | `sign()` throws (code 4001) | Toast: "You must sign to verify your identity" — stay on step 2 |
| Invalid signature (401) | backend returns 401 | Toast: "Signature verification failed" |
| Cleanverse rejection (400) | backend returns 400 with `error.details` | Toast with the Cleanverse error message |
| Already onboarded | `/identity/status` returns `registered: true` on step 0 | Skip to role selection or straight to `/app` if role known |
| A-Pass frozen | status `2`/`FROZEN` | Step 3 shows "Account frozen — contact admin" |
| Poll timeout | 60s elapsed, still PENDING | Soft-success + banner "Verification may take a moment" |

---

## 8. Pre-flight: check existing onboarding status

When the wallet connects (step 0), call `/identity/status` once:
- If `registered: true` and `status` active → skip the wizard, navigate `/app`.
- If `registered: true` but role unknown → skip to step 1 (role selection, then
  persist locally — the A-Pass already exists).
- If `registered: false` → show step 1 (role) → step 2 (KYC).

This avoids re-onboarding an existing user and lets returning users pick a
different role without re-doing KYC.

---

## 9. What does NOT change
- Step 0 (connect wallet) — already real, keep as-is.
- The role card UI in step 1 — keep, just remove ADMIN.
- The header / step indicator / `Layers` logo.
- `AuthLayout` is not used by this page (it has its own header) — no change.
- The shadcn UI primitives — all reusable.
- The `useOnboardIdentity` / `useIdentityStatus` hooks — already implemented in `src/api/hooks.js`, ready to call.

---

## 10. Open questions for the user
1. **KYC fields** — is a single identity document enough (one `identityDataList` entry), or do you want multi-document upload? Plan assumes one (simplest; Cleanverse allows multiple).
2. **customerId** — auto-generate (plan) or let the user type it? Auto-gen is cleaner for self-service; user-provided suits institutional flows.
3. **Country list** — ship a curated ~30-country list, or full ISO 3166-1 (249 entries, needs a searchable combobox)?
4. **Email** — drop entirely, or keep as optional local profile field? Backend `User.email` exists (optional) but onboard doesn't accept it.
5. **Demo mode** — `.env` has `SKIP_CIRCLE_WALLET`. Should onboarding have a demo bypass (skip KYC, instant active) for dev? The backend already has demo-mode paths in other services.
