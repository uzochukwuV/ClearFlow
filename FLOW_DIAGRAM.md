# ClearFlow - Complete Transaction Flow Diagram

## Legend
```
┌─────────────┐     ──────────>     │  DATA/FUNDS FLOW  │
│   ACTOR     │     =========>     │  SMART CONTRACT  │
│   SYSTEM    │                    └──────────────────┘
└─────────────┘
```

---

## PHASE 1: Identity Onboarding (Cleanverse A-Pass)

```
┌──────────────┐                    ┌─────────────────────────────────────┐
│     BUYER    │                    │           CLEARVERSE                │
│   (Corp A)   │                    │            A-Pass                    │
│              │──KYC Docs────────>│                                     │
│              │<──A-Pass ID───────│  • Verifies identity                 │
│              │                    │  • Issues A-Pass                    │
│              │                    │  • Tags: tier, countries             │
└──────────────┘                    └─────────────────────────────────────┘

┌──────────────┐                    ┌─────────────────────────────────────┐
│   SUPPLIER   │                    │           CLEARVERSE                 │
│   (Corp B)   │                    │            A-Pass                     │
│              │──KYC Docs────────>│                                     │
│              │<──A-Pass ID───────│  • Verifies identity                 │
│              │                    │  • Issues A-Pass                    │
└──────────────┘                    └─────────────────────────────────────┘

┌──────────────┐                    ┌─────────────────────────────────────┐
│   INVESTOR    │                    │           CLEARVERSE                 │
│   (LP)        │                    │            A-Pass                     │
│              │──KYC Docs────────>│                                     │
│              │<──A-Pass ID───────│  • Verifies identity                 │
│              │                    │  • Issues A-Pass                    │
└──────────────┘                    └─────────────────────────────────────┘
```

---

## PHASE 2: Purchase Order Creation & Signing

```
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│     BUYER    │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Creates PO  │──────>┌────────────────┐                                   │
│  Terms:      │       │ PurchaseOrder  │                                   │
│  - amount    │       │   Service      │                                   │
│  - quantity  │       └────────────────┘                                   │
│  - delivery  │                    │                                       │
└──────────────┘                    ▼                                       │
                         ┌─────────────────────────────────────┐            │
                         │         DATABASE                    │            │
                         │                                     │            │
                         │  ┌─────────────────────────────┐   │            │
                         │  │ PurchaseOrders              │   │            │
                         │  │ - id                       │   │            │
                         │  │ - buyer_id                 │   │            │
                         │  │ - supplier_id              │   │            │
                         │  │ - po_reference             │   │            │
                         │  │ - amount: 250,000 USD      │   │            │
                         │  │ - advance_amount: 200,000  │   │            │
                         │  │ - delivery_date            │   │            │
                         │  │ - status: PENDING_SIGNING │   │            │
                         │  └─────────────────────────────┘   │            │
                         └─────────────────────────────────────┘            │
                                                                          │
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│     BUYER    │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Signs PO    │──────>┌────────────────┐      ┌──────────────────────────┐│
│  Hash:       │       │   Signature    │      │  EIP-191 Signing         ││
│  EIP-191     │       │   Service      │─────>│                          ││
│              │       └────────────────┘      │  payload = canonical PO   ││
└──────────────┘              │                  │  hash = keccak(payload) ││
                              │                  │  signature = sign(hash) ││
                              ▼                  └──────────────────────────┘│
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│   SUPPLIER   │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Signs PO    │──────>┌────────────────┐      ┌──────────────────────────┐│
│  Same Hash   │       │   Signature    │      │  Verify Signature        ││
│              │       │   Service      │─────>│                          ││
└──────────────┘       └────────────────┘      │  • Verify buyer sig      ││
                              │                  │  • Verify supplier sig  ││
                              ▼                  │  • Both match hash?      ││
                         ┌─────────────────────────────────────┐            │
                         │         DATABASE                    │            │
                         │                                     │            │
                         │  ┌─────────────────────────────┐   │            │
                         │  │ POSignatures                │   │            │
                         │  │ - po_id                     │   │            │
                         │  │ - buyer_signature           │   │            │
                         │  │ - supplier_signature        │   │            │
                         │  │ - hash                      │   │            │
                         │  └─────────────────────────────┘   │            │
                         │                                     │            │
                         │  PurchaseOrder.status = SIGNED     │            │
                         └─────────────────────────────────────┘            │
                                                                          ▼
                    ┌──────────────────────────────────────────────────────┐
                    │              STATUS: PO SIGNED                       │
                    │   ┌──────────────────────────────────────────────┐   │
                    │   │  "Legal commitment exists between buyer       │   │
                    │   │   and supplier, tied to KYC'd identities"    │   │
                    │   └──────────────────────────────────────────────┘   │
                    └──────────────────────────────────────────────────────┘
```

---

## PHASE 3: Deal Creation & Circle Wallet Setup

```
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│   SUPPLIER   │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Initiates   │──────>┌────────────────┐                                   │
│  Deal        │       │    Deal        │                                   │
│              │       │   Service      │                                   │
└──────────────┘       └───────┬────────┘                                   │
                               │                                            │
                               │         ┌─────────────────────────────────┐│
                               │         │       CIRCLE API                 ││
                               │         │                                  ││
                               │         │  POST /v1/walletsets/{id}/wallets │
                               ├────────>│                                  ││
                               │         │  Creates new wallet for deal     ││
                               │         │                                  ││
                               │         │  Returns:                        ││
                               │         │  - walletId                      ││
                               │         │  - blockchain: Polygon            ││
                               │         │  - address: 0x...               ││
                               │         └─────────────────────────────────┘│
                               │                                            │
                               ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE                                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Deals                                         │   │
│  │  - id: DEAL-001                                                      │   │
│  │  - purchase_order_id: PO-001                                         │   │
│  │  - target_amount: 200,000 USDC                                       │   │
│  │  - running_total: 0                                                  │   │
│  │  - funding_deadline: 2024-12-31                                      │   │
│  │  - yield_percentage: 5%                                              │   │
│  │  - status: OPEN                                                      │   │
│  │  - deal_wallet_id: CIRCLE_WALLET_001                                 │   │
│  │  - deal_wallet_address: 0x742d35Cc6634C0532 │                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       DealWallets                                    │   │
│  │  - wallet_id: CIRCLE_WALLET_001                                      │   │
│  │  - deal_id: DEAL-001                                                 │   │
│  │  - blockchain: polygon                                               │   │
│  │  - address: 0x742d35Cc6634C053292709b83e736  │                       │   │
│  │  - balance: 0 USDC                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 4: A-Token Issuance (Cleanverse Compliance Token)

```
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│   PLATFORM   │    │                  CLEARFLOW BACKEND                     │
│   ADMIN      │    │                                                        │
│              │    │  Creates A-Token for deal:                            │
│              │──────>┌────────────────┐                                   │
│              │       │    Token       │                                   │
│              │       │   Service      │                                   │
└──────────────┘       └───────┬────────┘                                   │
                               │                                            │
                               ▼                                            ▼
                    ┌───────────────────────────────────────────────────────┐
                    │                    CLEARVERSE API                    │
                    │                                                        │
                    │  POST /atoken/launch                                  │
                    │  ┌─────────────────────────────────────────────────┐ │
                    │  │ {                                              │ │
                    │  │   chain: "polygon",                             │ │
                    │  │   token_name: "PO Financing — PO-001",          │ │
                    │  │   token_symbol: "POF-PO001",                    │ │
                    │  │   decimals: 6,                                  │ │
                    │  │   admin_address: "0x...platform_admin",          │ │
                    │  │   rule: {                                       │ │
                    │  │     min_tier: 2,                                 │ │
                    │  │     countries: ["US", "GB", "SG"],              │ │
                    │  │     is_black_list: false                        │ │
                    │  │   }                                             │ │
                    │  │ }                                               │ │
                    │  └─────────────────────────────────────────────────┘ │
                    │                                                        │
                    │  Response: { requestId: "REQ-123", status: "PENDING" }│
                    │                                                        │
                    │  ┌─────────────────────────────────────────────────┐ │
                    │  │ Poll GET /atoken/query_apply_status/REQ-123     │ │
                    │  │                                                  │ │
                    │  │ Until: applyStatus == "ISSUED"                  │ │
                    │  │                                                  │ │
                    │  │ On ISSUED:                                       │ │
                    │  │   - A-Token deployed on-chain                   │ │
                    │  │   - Compliance rules enforced at contract level  │ │
                    │  └─────────────────────────────────────────────────┘ │
                    └───────────────────────────────────────────────────────┘
                               │
                               │ On-Chain
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BLOCKCHAIN                                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     A-Token Contract (POF-PO001)                     │   │
│  │                                                                      │   │
│  │  • Total Supply: 0 initially                                        │   │
│  │  • Compliance Rules:                                                 │   │
│  │    - Only wallets with Cleanverse tier >= 2                         │   │
│  │    - Only wallets from allowed countries (US, GB, SG)              │   │
│  │    - Rules enforced at CONTRACT LEVEL                               │   │
│  │                                                                      │   │
│  │  • Mint function only callable by MINTER_ROLE holder               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Compliance Flow                                  │   │
│  │                                                                      │   │
│  │   Investor tries to transfer POF tokens ──> Contract checks:        │   │
│  │       ├── Wallet Cleanverse tier >= 2? ──> ALLOW/REJECT             │   │
│  │       └── Wallet country in allowed list? ──> ALLOW/REJECT         │   │
│  │                                                                      │   │
│  │   "Even a backend bug can't bypass on-chain compliance"             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 5: Investor Eligibility Check

```
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│   INVESTOR   │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Wants to    │──────>┌────────────────┐                                   │
│  contribute  │       │   Eligibility  │                                   │
│  50,000 USDC │       │   Service      │                                   │
└──────────────┘       └───────┬────────┘                                   │
                               │                                            │
                    ┌──────────┴──────────┐                                 │
                    │                     │                                 │
                    ▼                     ▼                                 │
         ┌──────────────────┐  ┌──────────────────┐                        │
         │   CLEARVERSE      │  │   DATABASE       │                        │
         │   API             │  │                  │                        │
         │                   │  │  Check:          │                        │
         │ POST /verify_apass│  │  - A-Pass exists│                        │
         │                   │  │  - Tier >= 2?   │                        │
         │ Returns:          │  │  - Country OK?  │                        │
         │ {                 │  │  - Not frozen   │                        │
         │   valid: true,    │  │                  │                        │
         │   tier: 3,        │  └──────────────────┘                        │
         │   countries: ["US"]│                                               │
         │ }                 │                                               │
         └─────────┬─────────┘                                               │
                   │                                                         │
                   │         ┌─────────────────────────────────────────────┐
                   │         │           A-Token Compliance Check          │
                   │         │                                              │
                   └────────>│  ┌─────────────────────────────────────────┐  │
                             │  │ On-Chain Rules Check:                   │  │
                             │  │                                          │  │
                             │  │ 1. min_tier: 2                          │  │
                             │  │    Investor tier: 3 ✓ PASS              │  │
                             │  │                                          │  │
                             │  │ 2. countries: ["US", "GB", "SG"]        │  │
                             │  │    Investor country: US ✓ PASS          │  │
                             │  │                                          │  │
                             │  │ Result: ELIGIBLE                         │  │
                             │  └─────────────────────────────────────────┘  │
                             └─────────────────────────────────────────────┘
                                           │
                                           ▼
                             ┌─────────────────────────────────┐
                             │        Investor Eligible        │
                             │                                 │
                             │  Can contribute to deal         │
                             │  USDC via:                       │
                             │  • Fiat → USDC (Cleanverse)     │
                             │  • USDC wallet (Circle)         │
                             │                                 │
                             └─────────────────────────────────┘
```

---

## PHASE 6: Funding (Two Paths)

### Path A: USDC Direct Transfer via Circle

```
┌──────────────┐         ┌──────────────────────────────────────────────────────┐
│   INVESTOR   │         │                  CLEARFLOW BACKEND                     │
│              │         │                                                        │
│  Has USDC    │         │                                                        │
│  in wallet   │         │                                                        │
│              │         │                                                        │
└──────┬───────┘         └──────────────────────────────────────────────────────┘
       │                 
       │  Initiates transfer
       │  to deal wallet
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE WALLETS                                       │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │   Investor Wallet   │              │    Deal Wallet      │               │
│  │                     │              │                     │               │
│  │  Balance: 100,000   │──────────────│  Balance: 0         │               │
│  │  USDC               │  50,000 USDC │  USDC               │               │
│  │                     │──────────────│                     │               │
│  │  0xInvestor...      │   TRANSFER   │  0xDealWallet...   │               │
│  │                     │              │                     │               │
│  └─────────────────────┘              └──────────┬──────────┘               │
│                                                    │                          │
└────────────────────────────────────────────────────│──────────────────────────┘
                                                     │
                                                     │ Circle Webhook
                                                     │ TRANSFER_COMPLETED
                                                     ▼
                                          ┌────────────────────────┐
                                          │   CLEARFLOW BACKEND    │
                                          │                        │
                                          │ 1. Create Contribution │
                                          │ 2. Update runningTotal │
                                          │ 3. Check if target met │
                                          │                        │
                                          └────────────────────────┘
```

### Path B: Fiat Funding via Cleanverse Fiat On-Ramp

```
┌──────────────┐         ┌──────────────────────────────────────────────────────┐
│   INVESTOR   │         │                  CLEARFLOW BACKEND                     │
│              │         │                                                        │
│  Has Fiat $  │         │                                                        │
│              │         │                                                        │
└──────┬───────┘         └──────────────────────────────────────────────────────┘
       │                 
       │  GET /fiat-ramp/quote
       │  { amount: 30000, currency: USD }
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLEARVERSE API                                       │
│                                                                              │
│  POST /query_ramp_quote                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Response:                                                             │   │
│  │ {                                                                     │   │
│  │   quoteToken: "QT-xxx",                                              │   │
│  │   fiatAmount: 30000,                                                 │   │
│  │   cryptoAmount: 30000 USDC,                                          │   │
│  │   exchangeRate: 1.00,                                                │   │
│  │   fees: 30,                                                          │   │
│  │   expiresAt: "..."                                                   │   │
│  │ }                                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       │  User completes payment via widget
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      CLEANVERSE WIDGET                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ┌─────────────────────────────────────────────────────────────┐     │   │
│  │  │                                                             │     │   │
│  │  │   BANK TRANSFER / CARD PAYMENT                             │     │   │
│  │  │                                                             │     │   │
│  │  │   From: Investor Bank Account                              │     │   │
│  │  │   To: Cleanverse Trust Account                             │     │   │
│  │  │   Amount: $30,000 USD                                      │     │   │
│  │  │                                                             │     │   │
│  │  └─────────────────────────────────────────────────────────────┘     │   │
│  │                                                                     │   │
│  │   Cleanverse receives fiat                                          │   │
│  │   ↓                                                                 │   │
│  │   Converts to USDC at market rate                                  │   │
│  │   ↓                                                                 │   │
│  │   Transfers USDC to deal wallet (Circle)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE WALLETS                                       │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │   Deal Wallet        │              │   Investor Wallet   │               │
│  │                     │◄─────────────│                     │               │
│  │  Balance: 80,000    │  30,000 USDC  │  (Fiat funded)      │               │
│  │  USDC               │   DEPOSIT     │                     │               │
│  │                     │              │                     │               │
│  │  (previously: 50k    │              │                     │               │
│  │   from Path A)      │              │                     │               │
│  │                     │              │                     │               │
│  └──────────┬──────────┘              └─────────────────────┘               │
│             │                                                             │
└─────────────│─────────────────────────────────────────────────────────────┘
              │
              │ Cleanverse Webhook
              │ TRANSFER_COMPLETED
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLEARFLOW BACKEND                                    │
│                                                                              │
│  1. Create Contribution (Path B - Fiat)                                     │
│  2. Update deal.running_total = 80,000                                      │
│  3. Check: 80,000 >= 200,000? NO → Still OPEN                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 7: Deal Closes - Target Reached

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FUNDING STATE MACHINE                                │
│                                                                              │
│     ┌─────────┐                                                             │
│     │  OPEN   │◄──────────────────────────────────────────┐                  │
│     └────┬────┘                                            │                  │
│          │                                                 │                  │
│          │  Contributions received                         │ More             │
│          │  runningTotal increases                         │ contributions    │
│          │                                                 │                  │
│          ▼                                                 │                  │
│  ┌───────────────────────────────┐                       │                  │
│  │                               │                       │                  │
│  │   runningTotal >= targetAmount│ ──────────────────────┘                  │
│  │   OR deadline reached?        │                                            │
│  │                               │                                            │
│  └───────────────────┬───────────┘                                            │
│                      │                                                        │
│                      │ YES                                                    │
│                      ▼                                                        │
│              ┌───────────────┐                                               │
│              │ CLOSED_FUNDED │                                               │
│              └───────┬───────┘                                               │
│                      │                                                        │
│                      │ 1. Stop accepting contributions                        │
│                      │ 2. Prepare supplier payout                             │
│                      │ 3. Calculate pro-rata token amounts                     │
│                      │ 4. Mint tokens to investors                             │
│                      │                                                        │
│                      ▼                                                        │
│              ┌───────────────┐                                               │
│              │    FUNDED     │                                               │
│              └───────────────┘                                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 8: Supplier Payout

```
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│   SUPPLIER   │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Expects     │<────│  Deal CLOSED_FUNDED                                  │
│  200,000     │    │  Initiates payout:                                    │
│  USDC        │──────>┌────────────────┐                                   │
│              │       │    Payout       │                                   │
└──────────────┘       │   Service       │                                   │
                       └───────┬────────┘                                   │
                               │                                            │
                               ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE TRANSFER                                      │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │   Deal Wallet        │              │   Supplier Wallet   │               │
│  │                     │              │   (Cleanverse A-Pass)│               │
│  │  Balance: 200,000   │──────────────│                     │               │
│  │  USDC               │  200,000 USDC│  Balance: 0         │               │
│  │                     │──────────────│                     │               │
│  │                     │   TRANSFER   │                     │               │
│  └─────────────────────┘              └─────────────────────┘               │
│                                                                              │
│  Circle Webhook: TRANSFER_COMPLETED                                          │
└──────────────────────────────────────────────────────────────────────────────┘
                               │
                               │ Now convert USDC to Fiat
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CLEANVERSE FIAT OFF-RAMP                                  │
│                                                                              │
│  POST /ramp/offramp                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Request:                                                            │   │
│  │ {                                                                   │   │
│  │   source: {                                                          │   │
│  │     type: "wallet",                                                 │   │
│  │     id: "supplier-wallet-id"                                        │   │
│  │   },                                                                │   │
│  │   destination: {                                                    │   │
│  │     type: "bank_account",                                          │   │
│  │     id: "supplier-bank-id"                                         │   │
│  │   },                                                                │   │
│  │   amount: { currency: "USD", amount: "200000" }                    │   │
│  │ }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │   Cleanverse:                                                       │   │
│  │   1. Converts USDC to USD                                           │   │
│  │   2. Initiates bank transfer                                         │   │
│  │   3. Sends to supplier's bank account                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────┐
│   SUPPLIER   │
│              │
│  Receives    │
│  $200,000    │
│  in bank     │
│              │
│  Can now     │
│  manufacture │
│  goods       │
└──────────────┘
```

---

## PHASE 9: Delivery & Buyer Repayment

```
┌──────────────┐         ┌──────────────────────────────────────────────────────┐
│   SUPPLIER   │         │                  CLEARFLOW BACKEND                     │
│              │         │                                                        │
│  Ships goods │         │                                                        │
│  to buyer    │─────────│                                                        │
│              │         │                                                        │
└──────────────┘         │                                                        │
       │                │                                                        │
       │                ▼                                                        ▼
       │    ┌─────────────────────────────────────────────────────────────────────┐
       │    │                    DELIVERY ATTESTATION                               │
       │    │                                                                      │
       │    │   Both parties sign "goods received" hash:                           │
       │    │                                                                      │
       │    │   Supplier signs ───────────────────────────────────────────┐        │
       │    │                                                              │        │
       │    │   Buyer signs    ──────────────────────────────────────────│────────┤
       │    │                                                              │        │
       │    │                           Both signatures verified            │        │
       │    │                           delivery = CONFIRMED              │        │
       │    │                                                              │        │
       │    └──────────────────────────────────────────────────────────────┘        │
       │                                                                              │
       │                                                                              ▼
       │    ┌─────────────────────────────────────────────────────────────────────┐
       │    │                    DATABASE UPDATE                                   │
       │    │                                                                      │
       │    │  Delivery.status = CONFIRMED                                         │
       │    │  Deal.status = AWAITING_REPAYMENT                                    │
       │    │                                                                      │
       │    └─────────────────────────────────────────────────────────────────────┘
       │                                                                              │
       │                                                                              ▼
       │    ┌─────────────────────────────────────────────────────────────────────┐
       └────│                        BUYER REPURCHASE                               │
            │                                                                      │
            │   Buyer sends full PO amount ($250,000) to deal wallet               │
            │                                                                      │
            │   Via Cleanverse Fiat On-Ramp (fiat → USDC):                        │
            │                                                                      │
            │   ┌─────────────────────────────────────────────────────────────┐   │
            │   │                                                             │   │
            │   │   BUYER BANK ──[Wire Transfer]──> Cleanverse              │   │
            │   │                                                             │   │
            │   │   Cleanverse ──[Converts to USDC]──> Circle Deal Wallet   │   │
            │   │                                                             │   │
            │   └─────────────────────────────────────────────────────────────┘   │
            │                                                                      │
            └─────────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE WALLET                                        │
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │   Deal Wallet        │                                                    │
│  │                     │                                                    │
│  │  Previous: 0 USDC   │                                                    │
│  │  + Buyer repayment: │                                                    │
│  │    250,000 USDC     │                                                    │
│  │  = Balance: 250,000│                                                    │
│  │                     │                                                    │
│  │  Now: Calculate     │                                                    │
│  │  investor payouts  │                                                    │
│  │  (principal + yield)│                                                    │
│  │                     │                                                    │
│  └─────────────────────┘                                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 10: Investor Settlement (Final)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         INVESTOR PAYOUT CALCULATION                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                     Deal Summary                                   │     │
│  │                                                                      │     │
│  │  Total Raised:     $200,000 USDC                                    │     │
│  │  Buyer Repaid:     $250,000 USDC  (principal + yield)              │     │
│  │  Total Profit:     $50,000 USDC                                     │     │
│  │  Yield Rate:       5%                                               │     │
│  │                                                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                   INVESTOR 1 (Path A - USDC Direct)                │     │
│  │                                                                      │     │
│  │  Contribution:    $50,000 USDC  (25% of total)                     │     │
│  │  Share:           50,000 / 200,000 = 25%                            │     │
│  │                                                                      │     │
│  │  Payout:                                                               │     │
│  │  - Principal:     $50,000                                           │     │
│  │  - Yield (5%):   $2,500                                             │     │
│  │  - Total:         $52,500 USDC                                       │     │
│  │                                                                      │     │
│  │  A-Token Balance: 50,000 POF-PO001 (25% of supply)                 │     │
│  │                                                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                   INVESTOR 2 (Path B - Fiat)                        │     │
│  │                                                                      │     │
│  │  Contribution:    $150,000 USDC  (75% of total)                     │     │
│  │  Share:           150,000 / 200,000 = 75%                            │     │
│  │                                                                      │     │
│  │  Payout:                                                               │     │
│  │  - Principal:     $150,000                                          │     │
│  │  - Yield (5%):    $7,500                                             │     │
│  │  - Total:         $157,500 USDC                                      │     │
│  │                                                                      │     │
│  │  A-Token Balance: 150,000 POF-PO001 (75% of supply)                 │     │
│  │                                                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                   VERIFICATION                                      │     │
│  │                                                                      │     │
│  │  Total Payout:    $52,500 + $157,500 = $210,000                      │     │
│  │  Check:          $250,000 - $210,000 = $40,000                      │     │
│  │                                                                      │     │
│  │  Wait... should be $200,000 × 1.05 = $210,000 ✓                     │     │
│  │                                                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│  INVESTOR 1   │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Receives    │<────│  Initiates payout to Investor 1:                      │
│  52,500 USDC │──────>┌────────────────┐                                   │
│              │       │    Payout       │                                   │
└──────────────┘       │   Service       │                                   │
                       └───────┬────────┘                                   │
                               │                                            │
                               ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE TRANSFER                                      │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │   Deal Wallet        │              │   Investor 1 Wallet  │               │
│  │                     │              │   (Circle)           │               │
│  │  Balance: 250,000   │──────────────│                     │               │
│  │  - 52,500 =         │  52,500 USDC │                     │               │
│  │  197,500 remaining  │──────────────│                     │               │
│  │                     │   TRANSFER   │                     │               │
│  └─────────────────────┘              └─────────────────────┘               │
│                                     ┌─────────────────────────────────────┐ │
│                                     │ Cleanverse Fiat Off-Ramp            │ │
│                                     │                                     │ │
│                                     │ 52,500 USDC ──> $52,500 USD         │ │
│                                     │ ──> Investor 1 Bank Account          │ │
│                                     │                                     │ │
│                                     └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
```
                               │
                               ▼
┌──────────────┐    ┌──────────────────────────────────────────────────────┐
│  INVESTOR 2   │    │                  CLEARFLOW BACKEND                     │
│              │    │                                                        │
│  Receives    │<────│  Initiates payout to Investor 2:                      │
│  157,500 USDC │──────>┌────────────────┐                                   │
│              │       │    Payout       │                                   │
└──────────────┘       │   Service       │                                   │
                       └───────┬────────┘                                   │
                               │                                            │
                               ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CIRCLE TRANSFER                                      │
│                                                                              │
│  ┌─────────────────────┐              ┌─────────────────────┐               │
│  │   Deal Wallet        │              │   Investor 2 Wallet  │               │
│  │                     │              │   (Circle)           │               │
│  │  Balance: 197,500  │──────────────│                     │               │
│  │  - 157,500 =        │  157,500    │                     │               │
│  │  40,000 remaining  │──────────────│  (Also Fiat Off-    │               │
│  │                     │   TRANSFER   │   Ramp to bank)     │               │
│  └─────────────────────┘              └─────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────────────┐
                    │         PLATFORM FEE (if any)       │
                    │                                     │
                    │  Remaining $40,000 - platform fees  │
                    │  Deal.status = COMPLETED             │
                    │                                     │
                    └─────────────────────────────────────┘
```

---

## COMPLETE FLOW SUMMARY

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                        CLEARFLOW COMPLETE LIFECYCLE                          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 1: ONBOARDING                                                  │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Buyer ──KYC──> Cleanverse ──A-Pass──> Ready                         │ │
│  │   Supplier ──KYC──> Cleanverse ──A-Pass──> Ready                      │ │
│  │   Investor ──KYC──> Cleanverse ──A-Pass──> Ready                      │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 2: PURCHASE ORDER                                              │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Buyer creates PO ──> Buyer signs ──> Supplier signs ──> PO LOCKED  │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 3: DEAL CREATION                                               │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Platform creates Circle deal wallet ──> Deal.status = OPEN         │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 4: A-TOKEN ISSUANCE                                            │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Cleanverse deploys A-Token ──> Compliance rules set on-chain        │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 5: FUNDING                                                     │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │                                                                        │ │
│  │   Investor A ──[USDC via Circle]──> Deal Wallet                       │ │
│  │   Investor B ──[Fiat via Cleanverse]──> Deal Wallet                   │ │
│  │   ...                                                                  │ │
│  │                                                                        │ │
│  │   runningTotal increases until target reached                          │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 6: CLOSE & MINT                                                │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   target reached ──> Deal closes ──> Mint POF tokens to investors      │ │
│  │   Deal.status = FUNDED                                                 │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 7: SUPPLIER PAYOUT                                             │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Deal Wallet ──[Circle USDC]──> Supplier Wallet                       │ │
│  │   Supplier Wallet ──[Cleanverse Off-Ramp]──> Supplier Bank ($)        │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 8: DELIVERY                                                    │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Supplier ships goods ──> Buyer confirms receipt ──> Delivery LOCKED │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 9: BUYER REPAYMENT                                              │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │   Buyer ──[Fiat via Cleanverse]──> Deal Wallet ($250,000 USDC)        │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │   PHASE 10: INVESTOR SETTLEMENT                                        │ │
│  │   ─────────────────────────────────────────────────────────────────── │ │
│  │                                                                        │ │
│  │   Deal Wallet ──[Circle]──> Investor A Wallet ──[Cleanverse]──> $52,500│ │
│  │   Deal Wallet ──[Circle]──> Investor B Wallet ──[Cleanverse]──> $157,500│
│  │                                                                        │ │
│  │   Deal.status = COMPLETED ✓                                            │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## SYSTEM COMPONENT SUMMARY

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            SYSTEM ARCHITECTURE                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     FRONTEND (React/Next.js)                        │   │
│  │  - User dashboards                                                    │   │
│  │  - PO creation & signing                                             │   │
│  │  - Deal browser                                                      │   │
│  │  - Investment flow                                                   │   │
│  │  - Fiat on-ramp widget                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ REST API                                │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     CLEARFLOW BACKEND                                 │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │   │ Identity    │  │ Deal        │  │ Payment                 │   │   │
│  │   │ Service     │  │ Service     │  │ Service                 │   │   │
│  │   │             │  │             │  │                         │   │   │
│  │   │ • onboard   │  │ • create    │  │ • contribution          │   │   │
│  │   │ • verify    │  │ • fund      │  │ • payout                │   │   │
│  │   │ • status    │  │ • close     │  │ • off-ramp              │   │   │
│  │   └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │   │
│  │   │ Signature   │  │ Token       │  │ Notification            │   │   │
│  │   │ Service     │  │ Service     │  │ Service                 │   │   │
│  │   │             │  │             │  │                         │   │   │
│  │   │ • canonical │  │ • launch    │  │ • email                 │   │   │
│  │   │ • sign      │  │ • mint      │  │ • webhook               │   │   │
│  │   │ • verify    │  │ • rules     │  │ • websocket             │   │   │
│  │   └─────────────┘  └─────────────┘  └─────────────────────────┘   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                    │                                    │                   │
│                    │                                    │                   │
│         ┌──────────┴──────────┐              ┌──────────┴──────────┐        │
│         │                     │              │                     │        │
│         ▼                     ▼              ▼                     ▼        │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │          CLEARVERSE             │  │            CIRCLE                │  │
│  │                                 │  │                                 │  │
│  │  ┌───────────────────────────┐ │  │  ┌───────────────────────────┐ │  │
│  │  │ A-Pass (Identity/KYC)     │ │  │  │ Wallet Management          │ │  │
│  │  │ • generate_apass          │ │  │  │ • wallet sets              │ │  │
│  │  │ • query_apass             │ │  │  │ • create wallet            │ │  │
│  │  │ • update_status           │ │  │  │ • get balance              │ │  │
│  │  │ • verify_apass            │ │  │  └───────────────────────────┘ │  │
│  │  └───────────────────────────┘ │  │                                 │  │
│  │                                 │  │  ┌───────────────────────────┐ │  │
│  │  ┌───────────────────────────┐ │  │  │ USDC Transfers            │ │  │
│  │  │ A-Token (Compliance)      │ │  │  │ • create transfer         │ │  │
│  │  │ • launch                  │ │  │  │ • get status              │ │  │
│  │  │ • query_apply_status      │ │  │  │ • webhooks                │ │  │
│  │  │ • add_rule                │ │  │  └───────────────────────────┘ │  │
│  │  └───────────────────────────┘ │  │                                 │  │
│  │                                 │  │                                 │  │
│  │  ┌───────────────────────────┐ │  │                                 │  │
│  │  │ Fiat Ramp (Conversions)   │ │  │                                 │  │
│  │  │ • query_ramp_quote        │ │  │                                 │  │
│  │  │ • create_ramp_widget_url  │ │  │                                 │  │
│  │  │ • query_ramp_order        │ │  │                                 │  │
│  │  │ • ramp/offramp            │ │  │                                 │  │
│  │  └───────────────────────────┘ │  │                                 │  │
│  │                                 │  │                                 │  │
│  │  ┌───────────────────────────┐ │  │                                 │  │
│  │  │ Audit                     │ │  │                                 │  │
│  │  │ • query_txs               │ │  │                                 │  │
│  │  │ • download_travel_rule    │ │  │                                 │  │
│  │  └───────────────────────────┘ │  │                                 │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Transaction Flow at a Glance

| Step | Actor | Action | Provider | Result |
|------|-------|--------|----------|--------|
| 1 | Buyer | KYC Registration | Cleanverse | A-Pass ID |
| 2 | Supplier | KYC Registration | Cleanverse | A-Pass ID |
| 3 | Investor | KYC Registration | Cleanverse | A-Pass ID |
| 4 | Buyer | Create PO | Backend | PO Record |
| 5 | Buyer | Sign PO | Backend | Signature |
| 6 | Supplier | Sign PO | Backend | Signature |
| 7 | Platform | Create Deal | Circle | Deal Wallet |
| 8 | Platform | Launch A-Token | Cleanverse | Compliance Token |
| 9 | Investor A | Verify Eligibility | Cleanverse | Eligible |
| 10 | Investor A | Transfer USDC | Circle | Contribution |
| 11 | Investor B | Fiat On-Ramp | Cleanverse → Circle | Contribution |
| 12 | Platform | Close Deal | Backend | Deal Funded |
| 13 | Platform | Mint Tokens | Cleanverse | POF Tokens |
| 14 | Platform | Pay Supplier | Circle → Cleanverse | Fiat to Supplier |
| 15 | Supplier | Ship Goods | Physical | Delivery |
| 16 | Buyer | Confirm Delivery | Backend | Delivery Confirmed |
| 17 | Buyer | Repay | Cleanverse → Circle | USDC to Deal Wallet |
| 18 | Platform | Pay Investor A | Circle → Cleanverse | Fiat to Investor A |
| 19 | Platform | Pay Investor B | Circle → Cleanverse | Fiat to Investor B |
| 20 | Platform | Complete Deal | Backend | Deal Completed |

---

*Diagram created: 2026-08-08*
