# Purchase Order Financing — Architecture

**Built on:** Cleanverse Cooperate API v5.6
**Track fit:** RWA · Compliant DeFi (Cleanverse Build hackathon)
**Status:** Hackathon MVP scope

---

## 1. One-line pitch

Suppliers with a verified purchase order can raise working capital from compliance-gated investors before manufacturing a single unit — the buyer's future payment, not the supplier's balance sheet, is the collateral.

---

## 2. Actors

| Actor | Role | Cleanverse identity |
|---|---|---|
| Buyer | Verified corporation issuing the PO, obligated to pay on delivery | A-Pass |
| Supplier | Manufacturer/exporter who needs capital to fulfil the PO | A-Pass |
| Investor (LP) | Funds the financing round, holds the PO-token, earns yield | A-Pass |
| Deal wallet | Platform-controlled custodial wallet per financing round; collects investor funds, disburses to supplier | A-Pass (registered as the issuing entity) |
| Platform backend | Orchestrates signatures, funding state machine, minting, repayment, compliance checks | N/A (calls Cleanverse API + chain RPC) |

---

## 3. What Cleanverse provides vs. what the platform builds

Being explicit about this boundary is the core of the architecture — Cleanverse secures **identity and eligibility**, not **commercial truth**.

| Layer | Cleanverse-secured (on-chain / API enforced) | Platform-built (off-chain / attested) |
|---|---|---|
| Identity | A-Pass binds a verified identity to each wallet, with tier/group/country tags | — |
| Signing | Reuses Cleanverse's own EIP-191 `personal_sign` pattern | PO hash construction, signature storage, verification logic |
| Asset issuance | A-Token contract deployed and managed via API | Deciding token economics (1 token ≈ $1 of financing position) |
| Transfer eligibility | A-Token `rule` (min_tier, countries) enforced **on-chain**, at the contract level | Setting the rule parameters per deal |
| Funding | Fiat Ramp (quote → widget → order) for fiat-funded investors | Multi-investor attribution, funding-round state machine, refund logic |
| Minting to investors | Token contract exposes `mint()` after `MINTER_ROLE` is granted | Backend calls `mint()` directly per investor, pro-rata |
| Delivery confirmation | — | Dual-signed "goods received" attestation (no logistics oracle) |
| Repayment matching | `query_txs` indexes the inbound transfer | Backend matches amount against signed PO terms |
| Audit trail | `download_travel_rule`, `query_txs`, `query_institution_txs` | — |
| Default enforcement | `update_status` (freeze A-Pass) | Deciding when a freeze is triggered |

**Known gap, stated honestly:** nothing in this stack proves the PO is genuine or that goods will be delivered. The system proves *who* signed what, not *what actually happens in the warehouse*. This is the same residual risk every real trade-finance lender carries — the difference is this stack makes counterparties cryptographically accountable and revocable (frozen A-Pass) rather than anonymous.

---

## 4. Identity onboarding

```
Buyer  → POST /generate_apass  (KYC docs, wallet, chain)
Supplier → POST /generate_apass
Deal wallet → POST /generate_apass  (registered as issuing entity for the round)
```

`countries` tags are derived automatically from `identityDataList[].issuingCountryISO2` — used later to set the A-Token's jurisdictional rule.

---

## 5. PO signing (dual signature)

No Cleanverse endpoint covers this — reuses Cleanverse's own signature convention for consistency with the rest of the stack.

1. Canonicalize PO terms: `{buyer_address, supplier_address, quantity, amount, delivery_date, po_reference}`.
2. Hash the canonical payload.
3. Buyer signs the hash (`personal_sign`) with their A-Pass wallet key.
4. Supplier signs the same hash with theirs.
5. Store `{payload, hash, buyer_sig, supplier_sig}` in the platform database, keyed by hash.

This produces non-repudiation tied to a KYC'd identity — a legal commitment, not proof of future performance.

---

## 6. Token design

**One A-Token per financed PO** (not a shared pool token) — isolates counterparty risk per deal.

```
POST /atoken/launch
{
  chain: "<deal chain>",
  token_name: "PO Financing — <po_reference>",
  token_symbol: "POF-<po_reference>",
  decimals: 6,
  admin_address: "<platform admin wallet>",
  rule: {
    min_tier: <investor accreditation floor>,
    countries: [<eligible jurisdictions>],
    is_black_list: false
  },
  icon: "<icon url>"
}
```

- Total supply minted = advance amount raised (e.g. 200,000 units ≈ $200,000 of financing position on a $250,000 PO).
- Token represents a **debt claim**, redeemed at face value + yield spread when the buyer repays — not equity in the underlying goods.
- Compliance rule enforced **on-chain, at the contract level** — even a backend bug can't let an ineligible wallet hold or receive units.

Poll `GET /atoken/query_apply_status/{requestId}` until `applyStatus == ISSUED`.

---

## 7. Funding: multi-investor attribution

Cleanverse's ramp is built for a single wallet's on/off-ramp, not a pooled raise — the platform adds an attribution layer on top, converging all contributions into one **deal wallet**.

### Path A — investor already holds USDC
```
1. POST /verify_apass (or /validator/verify) on investor wallet — gate BEFORE showing "contribute"
2. Investor sends USDC directly to the deal wallet address
3. Backend polls POST /query_txs on the deal wallet
   → attributes each inbound transfer by from_address + amount
```

### Path B — investor funds with fiat
```
1. POST /query_ramp_quote
   { fiatCurrency, cryptoCurrency: "USDC", isBuyOrSell: "BUY",
     network: "<deal chain>", fiatAmount, partnerCustomerId: "<internal investor id>" }
2. POST /create_ramp_widget_url
   { quoteToken, wallet: { address: "<deal wallet>", chain: "<deal chain>" } }
   → receiving-side eligibility checks the deal wallet's A-Pass (already registered)
3. Backend polls POST /query_ramp_order by orderId / partnerCustomerId
   → attributes contribution once status == COMPLETED
```

### Funding round state machine

```
OPEN         → running_total = Σ(confirmed Path A) + Σ(completed Path B)
             → target = advance amount, window = deadline

target reached before deadline → CLOSED_FUNDED
  → disburse running_total to supplier's A-Pass wallet
  → mint POF units to each investor, pro-rata:
       units(investor) = (contribution(investor) / running_total) × total_supply

deadline reached, target not met → CLOSED_SHORTFALL
  → Path A refund: reverse on-chain transfer (straightforward)
  → Path B refund: SELL-side ramp quote back to investor's bank (real flow,
    scoped OUT of hackathon MVP — flagged as v2)
```

### Minting mechanism (no smart contract writing required)

After `applyStatus == ISSUED`:
1. Using `admin_address`, grant `MINTER_ROLE` to a platform-controlled minter key.
2. Backend calls the deployed token contract's existing `mint()` function directly (ethers.js / solana web3.js), one call per investor, sized per the pro-rata formula above.

This is *calling* an already-deployed contract function — not authoring new Solidity/Rust.

---

## 8. Supplier payout

Once `CLOSED_FUNDED`, the deal wallet sends `running_total` (in USDC) to the supplier's A-Pass wallet — a standard on-chain transfer, indexed automatically via `query_txs` / `query_institution_txs`.

---

## 9. Delivery and repayment

```
1. Delivery attestation: buyer + supplier re-sign a "goods received" hash
   (same EIP-191 pattern as step 5 — no logistics oracle integration)

2. Buyer sends full PO amount to the deal wallet

3. Backend detects via POST /query_txs, matches amount against the
   original signed PO terms

4. Repayment distributed pro-rata to POF-token holders:
   payout(investor) = holding_share × (principal + yield spread)
   (holder ledger maintained by the platform — Cleanverse has no
   token-balance query endpoint)
```

---

## 10. Default handling

If the buyer disputes or fails to pay by the delivery deadline:

```
POST /update_status
{ status: "2" (freeze), wallet: { chain, address: buyer_address },
  blacklistReason: "PO default — <po_reference>" }
```

A frozen A-Pass blocks the buyer's ability to transact compliantly on any Cleanverse-integrated rail going forward — the platform's enforcement lever in place of traditional legal collections.

---

## 11. Audit / compliance export

```
POST /download_travel_rule   → per-transaction Travel Rule PDF
POST /query_txs               → full transaction history, any wallet
POST /query_institution_txs   → deposit/withdraw audit between deal wallet and counterparties
POST /query_apass_list        → reconciliation view of all onboarded identities
```

---

## 12. Full endpoint map

| Stage | Endpoint |
|---|---|
| Onboard buyer/supplier/investor/deal wallet | `POST /generate_apass` |
| Check identity status | `POST /query_apass`, `POST /query_apass_list` |
| Issue PO-token | `POST /atoken/launch` |
| Poll issuance | `GET /atoken/query_apply_status/{requestId}` |
| Set/inspect compliance rule | `POST /atoken/add_rule`, `POST /atoken/rules` |
| Gate investor before funding | `POST /verify_apass`, `POST /validator/verify` (optional second gate) |
| Fiat-funded contribution | `POST /query_ramp_quote` → `POST /create_ramp_widget_url` → `POST /query_ramp_order` |
| Track deal wallet inflows | `POST /query_txs` |
| Deposit address for the round | `POST /query_deposit_address` |
| Freeze on default | `POST /update_status` |
| Audit export | `POST /download_travel_rule`, `POST /query_institution_txs` |

---

## 13. Scoped OUT of hackathon MVP (stated explicitly, not hidden)

- Path B (fiat) refunds on funding shortfall
- Real logistics/delivery oracle (currently dual-signature attestation only)
- Warehouse/commodity attestation layer (CommodityFlow extension — roadmap only)
- Cross-round secondary market for POF-tokens
- Automated yield-rate pricing (fixed spread for demo)

---

## 14. Demo script (for judges)

1. Onboard buyer + supplier → show A-Pass with tier/country tags.
2. Sign a PO (dual signature) → show stored hash + both signatures.
3. Launch the PO-token with a compliance rule.
4. Attempt investor contribution from an **ineligible** wallet → rejected at `verify_apass` **and** at the token contract level if forced through.
5. Contribute from an **eligible** wallet (Path A) and one fiat-funded investor (Path B).
6. Close the round → show pro-rata mint to both investors.
7. Simulate delivery + buyer repayment → show yield distributed.
8. Pull `download_travel_rule` for the full audit trail.