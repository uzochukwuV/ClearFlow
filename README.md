# ClearFlow

ClearFlow is a verified purchase-order financing platform for compliant trade finance.

## Problem

Trade finance is fragmented: identity verification, purchase-order signing, funding, and settlement usually live in separate systems. That creates manual review, slow execution, and weak compliance enforcement. The deeper issue is that most platforms can tell you who signed something, but not reliably tie that signature to a live compliance credential and a real funding rail.

## Solution

ClearFlow turns a purchase order into a financed, auditable workflow.

A buyer and supplier each connect a wallet and are onboarded through Cleanverse A-Pass. If a wallet already has an active A-Pass, onboarding is skipped. If not, the user completes KYC once and gets a reusable compliance identity.

From there, ClearFlow:

1. Canonicalizes the purchase order terms.
2. Collects buyer and supplier signatures on the exact same PO payload.
3. Creates a financing deal tied to a Circle developer-controlled wallet.
4. Launches an A-Token for the deal with on-chain compliance rules.
5. Lets only eligible investors contribute.
6. Supports both crypto funding and Cleanverse fiat ramp funding.
7. Mints financing positions only after funds are verified.
8. Handles repayment, settlement, and claim/disbursement tracking through the same compliance rails.

## Integrations used in the build

| Integration | Used for |
|---|---|
| `generate_apass` | Create A-Pass identities for buyer, supplier, and investor onboarding |
| `query_apass` | Detect existing A-Pass records, read tier/country/status, and skip onboarding when already active |
| `verify_apass` | Gate PO actions, deal participation, and investor eligibility |
| `update_status` | Freeze or unfreeze identities for compliance/default handling |
| `query_ramp_quote` | Price the fiat ramp before launching the widget |
| `create_ramp_widget_url` | Open Cleanverse fiat ramp for buyer payment and investor contribution |
| `query_ramp_order` | Track fiat payment completion for buyer payment, investor contribution, and claim/payout-related flows |
| `launch` / `register` A-Token | Create the per-deal compliance token |
| `add_rule` / `set_rule` / `query_rules` | Enforce tier and country restrictions on token holders |
| `query_txs` / `query_institution_txs` | Audit wallet transfers and deposit/withdraw history |
| `download_travel_rule` | Export compliance audit records |
| Circle wallet sets / `createWallets` | Create one deal wallet per financing round |
| `getWallet` / `getWalletTokenBalance` | Read wallet metadata and balances |
| `createTransaction` | Send USDC from deal wallet to supplier or investors |
| `listTransactions` | Verify deposits landed in the deal wallet |
| `signMessage` | Sign admin approvals server-side with the Circle admin wallet |
## CVI/CVA integration points

ClearFlow uses Cleanverse where trust and eligibility matter, and Circle where settlement matters.

- Cleanverse A-Pass identity
  - `generate_apass`
  - `query_apass`
  - `verify_apass`
  - `update_status`

- Cleanverse fiat ramp
  - buyer payment path
  - investor contribution path
  - ramp order status checks for claim / payout-related flows
  - `query_ramp_quote`
  - `create_ramp_widget_url`
  - `query_ramp_order`

- Cleanverse A-Token compliance
  - `launch` / `register`
  - `add_rule` / `set_rule` / `query_rules`
  - tier and country gating derived from A-Pass metadata

- Circle settlement layer
  - developer-controlled deal wallets
  - USDC escrow and payouts
  - wallet balance / transaction verification

## What ClearFlow builds vs. what Cleanverse/Circle provide

This split is the core architecture.

- Cleanverse secures identity, eligibility, ramp, and token compliance.
- Circle secures wallet control and USDC settlement.
- ClearFlow builds the commercial logic in between:
  - PO canonicalization
  - dual-party signature verification
  - deal state machine
  - investor attribution
  - verified minting
  - repayment and distribution accounting

That means the system proves who signed what, who is eligible, and which funds actually landed. It does not pretend to solve warehouse truth or physical delivery oracle problems. That residual trade risk is explicit and part of the hackathon MVP boundary.

## Deployed chain(s)

- Base Sepolia is the current chain for wallet switching, contract interaction, identity defaults, and funding defaults.
- Cleanverse A-Pass records are queried on Base.
- Circle developer-controlled wallets are configured to operate in the same deployment context.

## Why it matters

ClearFlow makes trade finance programmable without removing compliance. It combines KYC, legal signature intent, funding verification, and settlement into one pipeline that a buyer, supplier, investor, and platform can all trust.

## Hackathon scope

Included in the MVP:

- identity onboarding and A-Pass reuse
- dual-signed purchase orders
- deal creation and Circle wallet setup
- crypto and fiat funding paths
- compliance-gated investor participation
- verified token minting after confirmed funds
- settlement and payout tracking

Not the focus of the MVP:

- logistics or warehouse oracle integrations
- secondary market trading
- dynamic pricing models
- automatic proof of delivery beyond signed attestation
