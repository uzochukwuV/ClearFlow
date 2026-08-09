// ClearFlow backend API client.
//
// All backend endpoints are under /api/v1. In dev, Vite proxies /api → the
// backend (see vite.config.js), so the browser calls a same-origin URL. In
// production, set VITE_API_URL to the backend origin.
//
// Auth model: the backend has no passwords. Signed requests carry the wallet
// address + an EIP-191 signature in headers (X-Wallet-Address, X-Signature,
// X-Message). The backend recovers the signer with ethers.verifyMessage and
// treats the recovered address as the caller. Unsigned GETs (list/detail) work
// without auth; signed mutations attach the headers via signRequest().

import axios from 'axios';

export const API_BASE_URL =
  (import.meta.env?.VITE_API_URL || '') + '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach a wallet-signature auth header set to a request config.
// `signer` is an async (message) => signature function (from useWallet().sign).
export async function withAuth(config, signer, message) {
  const msg = message || `CLEARFLOW_AUTH:${Date.now()}`;
  const signature = await signer(msg);
  return {
    ...config,
    headers: {
      ...(config?.headers || {}),
      'X-Wallet-Address': config?.headers?.['X-Wallet-Address'] || undefined,
      'X-Signature': signature,
      'X-Message': msg,
    },
  };
}

// Normalize the backend response shape. The backend returns either
// { success: true, <payload> } or { success: false, error }. This returns the
// payload on success and throws an Error with the backend message on failure.
export function unwrap(res) {
  const data = res?.data;
  if (data && typeof data === 'object' && 'success' in data) {
    if (data.success) {
      const { success, ...rest } = data;
      return rest;
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// Convenience: GET that unwraps.
export async function get(path, config) {
  return unwrap(await api.get(path, config));
}

// Convenience: POST that unwraps. If `signer` is provided, attaches sig-auth.
export async function post(path, body, config, signer) {
  const finalConfig = signer ? await withAuth(config, signer) : config;
  return unwrap(await api.post(path, body, finalConfig));
}
