// Circle developer-controlled wallet integration (frontend side).
//
// SECURITY: the Circle API key + entity secret MUST NEVER be in the browser.
// All Circle operations go through the backend proxy at /api/v1/circle/*, which
// holds the secrets and calls the Circle SDK server-side.
//
// This module is the frontend client for that proxy. It also falls back to
// direct on-chain reads (src/lib/balance.js) for balance checks, which need no
// secrets — a Circle wallet is just a normal EVM address on Monad testnet.

import { get, post } from '../client';
import { getBalances as readOnChainBalances } from '../../lib/balance';

// Health check — confirms the backend's Circle config is wired up.
export function circleHealth() {
  return get('/circle/health');
}

// Get a Circle developer-controlled wallet by ID.
export function getCircleWallet(walletId) {
  return get(`/circle/wallets/${walletId}`);
}

// Get the wallet's USDC balance via the Circle API (backend proxy).
// Returns { balances, totalUsdc }.
export function getCircleWalletBalances(walletId) {
  return get(`/circle/wallets/${walletId}/balance`);
}

// Get the on-chain deposit address for a Circle wallet.
// Returns { address }.
export function getCircleWalletAddress(walletId) {
  return get(`/circle/wallets/${walletId}/address`);
}

// Get the status of a Circle transfer/transaction by ID.
// Returns { transfer }.
export function getCircleTransfer(transferId) {
  return get(`/circle/transfers/${transferId}`);
}

// Read a Circle wallet's balances DIRECTLY on-chain (no Circle API, no secrets).
// Preferred for frequent polling since it doesn't hit the Circle rate-limited
// balance endpoint. `address` is the wallet's on-chain EVM address (from
// getCircleWalletAddress). Returns { usdc, native } as human-readable strings.
export function readWalletBalancesOnChain(address) {
  return readOnChainBalances(address);
}

// Resolve a deal wallet's on-chain address, then read its balances on-chain.
// Two calls: one to get the address (backend proxy), one to read balances
// (direct RPC). Returns { address, usdc, native }.
export async function getDealWalletOnChainBalances(walletId) {
  const { address } = await getCircleWalletAddress(walletId);
  if (!address) throw new Error('No address for wallet');
  const balances = await readOnChainBalances(address);
  return { address, ...balances };
}
