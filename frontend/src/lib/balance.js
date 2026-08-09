// On-chain balance reads for Monad testnet.
//
// These read balances DIRECTLY from the chain via an ethers JsonRpcProvider —
// no Circle API key or entity secret required. Safe to call from the browser.
//
// Use this for:
//   - showing the connected EOA's USDC + MON balance (investor/buyer/supplier)
//   - showing a deal wallet's USDC balance (the Circle developer-controlled
//     wallet has a normal on-chain address; balanceOf works on it)
//
// For Circle-specific metadata (walletId, walletSetId, transactions signed via
// MPC), use the backend proxy (src/api/resources/circle.js) instead — the
// entity secret must never reach the browser.

import { JsonRpcProvider, Contract, formatUnits } from 'ethers';
import { MONAD_TESTNET, USDC, ERC20_ABI } from './chains';

let _provider = null;
let _usdc = null;

// Single shared provider (JsonRpcProvider is cheap to keep around).
export function getProvider() {
  if (!_provider) {
    _provider = new JsonRpcProvider(MONAD_TESTNET.rpcUrls[0], {
      chainId: MONAD_TESTNET.chainId,
      name: MONAD_TESTNET.name,
    });
  }
  return _provider;
}

function getUsdcContract() {
  if (!_usdc) {
    _usdc = new Contract(USDC.address, ERC20_ABI, getProvider());
  }
  return _usdc;
}

// Read the USDC (6-decimal) balance of an address. Returns a human-readable
// string, e.g. "100.5". Throws if the RPC call fails.
export async function getUsdcBalance(address) {
  const usdc = getUsdcContract();
  const balance = await usdc.balanceOf(address);
  return formatUnits(balance, USDC.decimals);
}

// Read the native MON (18-decimal) balance of an address.
export async function getNativeBalance(address) {
  const provider = getProvider();
  const balance = await provider.getBalance(address);
  return formatUnits(balance, 18);
}

// Read both USDC and MON balances. Returns { usdc, native } as strings.
// Never throws — returns '0' on error so UIs don't crash on RPC hiccups.
export async function getBalances(address) {
  if (!address) return { usdc: '0', native: '0' };
  const [usdc, native] = await Promise.allSettled([
    getUsdcBalance(address),
    getNativeBalance(address),
  ]);
  return {
    usdc: usdc.status === 'fulfilled' ? usdc.value : '0',
    native: native.status === 'fulfilled' ? native.value : '0',
  };
}

// Parse a human USDC amount string into bigint units (6 decimals). Mirrors the
// backend's parseUSDC.
export function parseUsdc(amount) {
  return BigInt(Math.round(Number(amount) * 1e6));
}

// Format a bigint/string USDC amount into a human-readable string.
export function formatUsdc(amount) {
  return formatUnits(amount, USDC.decimals);
}

// Build an unsigned USDC transfer transaction (for the connected wallet to send
// via MetaMask). Returns the populated transaction object ready for
// signer.sendTransaction. The deal wallet address is the recipient.
//
// amount is a human-readable string, e.g. "100.5".
export async function buildUsdcTransfer(fromAddress, toAddress, amount) {
  const usdc = new Contract(USDC.address, ERC20_ABI, getProvider());
  const units = parseUsdc(amount);
  const data = usdc.interface.encodeFunctionData('transfer', [toAddress, units]);
  return {
    from: fromAddress,
    to: USDC.address,
    data,
    chainId: MONAD_TESTNET.chainId,
  };
}

// Send USDC from the connected MetaMask account to a deal wallet.
// Uses the injected provider's signer (not the read-only RPC provider).
export async function sendUsdc(toAddress, amount) {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet found.');
  }
  const browserProvider = new JsonRpcProvider(window.ethereum, {
    chainId: MONAD_TESTNET.chainId,
    name: MONAD_TESTNET.name,
  });
  const signer = await browserProvider.getSigner();
  const fromAddress = await signer.getAddress();
  const tx = await buildUsdcTransfer(fromAddress, toAddress, amount);
  const sent = await signer.sendTransaction(tx);
  return sent;
}
