# ClearFlow — Agent Notes

## Project
Purchase Order Financing backend (Node.js + TS + Express + Prisma + Postgres).
Two external integrations: **Cleanverse** (KYC/A-Pass, A-Token, fiat ramp) and **Circle** (USDC developer-controlled wallets).

## Circle integration (key learnings)
- The `.env` credentials are **production** Circle (`https://api.circle.com`), NOT sandbox. The original `.env` had `CIRCLE_BASE_URL=https://api-sandbox.circle.com` which returns 401. Fixed to `https://api.circle.com`.
- API key format `TEST_API_KEY:<id>:<secret>` is valid for the prod API. The `TEST_API_KEY:` prefix is normal, not a placeholder. It's a TEST-tier key: works on testnets (MONAD-TESTNET, MATIC-AMOY), rejected on mainnets (`156006 TEST_API key cannot be used with blockchain mainnets`).
- Wallet set `b7be0c66-b6ff-5636-8529-7d1e3ae906d1` ("My First Dev-Controlled Wallet Set") is the prod developer-controlled wallet set.
- The SDK `@circle-fin/developer-controlled-wallets` high-level client (`initiateDeveloperControlledWalletsClient`) **auto-generates the entity secret ciphertext per request** — no manual ciphertext code needed. Do NOT pass `entitySecretCiphertext` to the high-level methods; passing a manually-generated one causes `Cannot read properties of undefined (reading 'config')` / 401.
- SDK method names (high-level client): `createWallets`, `listWallets`, `getWallet`, `getWalletTokenBalance`, `createTransaction`, `getTransaction`, `createWalletSet`, `listWalletSets`. NOT `createWallet`/`createTransfer`.
- `getTransaction` supports `waitForState` / `waitForTxHash` polling options; otherwise fetches once.
- `createTransaction` high-level input shape: `{ amount: ['2'], walletId, destinationAddress, blockchain, fee: { type: 'level', config: { feeLevel: 'MEDIUM'|'HIGH'|'LOW' } }, tokenAddress }`. Note: `amount` (singular array), and `fee` is a nested `{type, config:{feeLevel}}` object — NOT a top-level `feeLevel`. Passing `amounts`/`feeLevel` directly throws `Cannot read properties of undefined (reading 'config')`.
- Blockchain value for Monad testnet is `MONAD-TESTNET` (internal `MONAD`/`monad` maps to it in `wallet.service.ts` CHAIN_MAP). For Polygon it's `MATIC-AMOY`.
- `SKIP_CIRCLE_WALLET` env flag toggles demo mode. Set to `false` for real Circle calls. `env.ts` has it as optional string defaulting to `'false'`.

## Monad testnet specifics
- RPC: `https://rpc.ankr.com/monad_testnet` (also `https://monad-testnet.drpc.org`). chainId 10143.
- USDC contract (Circle-issued, 6 decimals): `0x534b2f3A21130d7a60830c2Df862319e593943A3` (from developers.circle.com/stablecoins/usdc-contract-addresses).
- Native gas token: MON. Circle developer-controlled wallets need MON gas for outgoing transfers (Circle signs the EOA key, but the wallet pays gas).
- Test wallets + private keys live in `recovery/wallet.json` (ADMIN/BUYER/SUPPLIER/INVESTOR_1/INVESTOR_2). NEVER commit. ADMIN funds deal wallets on-chain; SUPPLIER/INVESTOR receive payouts.
- Circle public faucet (faucet.circle.com) drips 20 USDC / 2h per address per chain. The `/v1/faucet/drips` API endpoint returns 403 Forbidden for this key tier — use the web faucet.
- Funding path that works: ADMIN (external EOA, key held) sends USDC + MON on-chain to the Circle deal wallet address via ethers v6; then Circle `createTransaction` sends USDC from the deal wallet to any address. Verified end-to-end (deal->supplier 2 USDC, CONFIRMED, txHash 0x2f4b4d41...).

## Tooling
- **Use `npx tsx` to run TS scripts** (e.g. `npx tsx scripts/test-create-wallet.ts`). `ts-node` is broken with TypeScript 7 (`Cannot read properties of undefined (reading 'fileExists')`). `tsx` is a devDependency. Scripts using top-level await must wrap in `async function main(){...}();`.
- `tsconfig.json` has `rootDir: ./src`, so scripts under `scripts/` are excluded from the build but tsx runs them fine.
- Build: `npx tsc --noEmit` for typecheck (passes clean).
- `ethers` v6 is a dependency — used for on-chain funding from the ADMIN wallet (ethers.Wallet + JsonRpcProvider, `usdc.transfer(addr, parseUnits('5',6))`).

## Circle wallet flow (per deal)
`deal.service.ts createDeal` → `CircleWalletService.createDealWallet(dealId, chain)` creates one EOA wallet in the wallet set → stores `circleWalletId` + `circleWalletAddress` on the Deal row. That wallet holds all USDC for the deal (contributions in, supplier payout out, investor payouts out).

## Test scripts (kept)
- `scripts/test-e2e-monad.ts` — full end-to-end: create deal wallet (MONAD-TESTNET) + fund from admin on-chain (USDC+MON via ethers) + transfer to supplier via Circle API.
- `scripts/test-circle-transfer.ts` — reuse an already-funded deal wallet (DEAL_WALLET_ID env) to test just the Circle transfer step.
- `scripts/test-create-wallet.ts` — raw SDK createWallets smoke test.
- `scripts/test-deal-wallet.ts` — exercises `CircleWalletService.createDealWallet` + getDealWallet/getDepositAddress/getWalletBalances round-trip.
- `scripts/test-circle-auth.ts` — raw curl-style auth check (useful to debug 401s).
- `scripts/test-verified-deposit.ts` — E2E for the unified verified-deposit pipeline: records a PENDING CRYPTO contribution, sends USDC on-chain from ADMIN → deal wallet, polls `DepositVerificationService.verifyCryptoDeposit` until the contribution flips to CONFIRMED with txHash + confirmedAt. Usage: `npx tsx scripts/test-verified-deposit.ts [dealWalletId]`.

## Deposit verification pipeline (unified)
The core invariant: **A-tokens are NEVER minted until a deposit is verified.** Two contribution paths feed one verification layer:

- **Path A — CRYPTO** (`ContributionType.CRYPTO`): investor sends USDC on-chain to the deal wallet. `DepositVerificationService.verifyCryptoDeposit` confirms the deposit by listing Circle inbound transactions (`CircleWalletService.listInboundTransactions` — filters `listTransactions` to `operation=TRANSFER`, `custodyType=DEVELOPER`, `destinationAddress=wallet`, `state=CONFIRMED/COMPLETE`) and matching by amount + sourceAddress. Belt-and-braces fallback reads `USDC.balanceOf` via the Monad RPC (proves funds present even if Circle's indexer lags, but leaves status PENDING until Circle attaches a txHash).
- **Path B — FIAT** (`ContributionType.FIAT`): investor pays via Cleanverse ramp. `contribute()` does real `getOnRampQuote` → `createWidgetUrl`, stores `rampQuoteToken`. `DepositVerificationService.verifyFiatDeposit` polls `query_ramp_order` to COMPLETED, then confirms the USDC landed in the deal wallet via the same Circle `listInboundTransactions` check.

`contribute()` (Intent → Verify → Mint) creates the Contribution PENDING, records the funding source, then either (a) `mintTokensOnConfirm=true` blocks on `pollUntilVerified` + mints, or (b) default async enqueues a `verify-deposit` / `poll-ramp-order` Bull job (falls back to an inline check if Redis is down). `mintTokensForContribution` only runs on CONFIRMED contributions — it mints POF A-Tokens 1:1, updates deal `runningTotal`/`totalSupply`, flips deal to FUNDED at target.

Key files: `src/services/funding/deposit-verification.service.ts` (verification core), `src/services/deal/deal.service.ts` `contribute`/`mintTokensForContribution`, `src/jobs/queue.ts` (`verify-deposit` + `poll-ramp-order` processors), `src/routes/webhooks.ts` (`ramp.order.completed/failed` handler).

Prisma `Contribution.type` is now a `ContributionType` enum (`CRYPTO`|`FIAT`) and `status` a `ContributionStatus` enum (`PENDING`|`CONFIRMED`|`REFUNDED`|`FAILED`). The old code wrote the invalid string `'FIAT_ONRAMP'` — removed. `confirmedAt` and `toAddress` are now always written on confirmation (were never written before).
