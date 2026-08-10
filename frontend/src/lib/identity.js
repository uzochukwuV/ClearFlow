// Identity helpers for onboarding.

// Generate a Cleanverse customerId (12+ alphanumeric chars, A-Z/a-z/0-9 only).
// Format: "CF" + 8 hex chars from the wallet address + 4 base36 chars from the
// timestamp → 14 chars total, guaranteed alphanumeric and unique-per-wallet-per-second.
export function generateCustomerId(walletAddress) {
  const slice = (walletAddress || '0x00000000').slice(2, 10).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `CF${slice}${ts}`;
}

// Map the backend's A-Pass status to a normalized label.
// Cleanverse query_apass returns numeric status (1=active, 2=frozen); the
// backend stores it as a string and may return "PENDING" before first query.
export function normalizeApassStatus(status) {
  if (status == null) return 'UNKNOWN';
  const s = String(status);
  if (s === '1' || s.toUpperCase() === 'ACTIVE') return 'ACTIVE';
  if (s === '2' || s.toUpperCase() === 'FROZEN') return 'FROZEN';
  if (s.toUpperCase() === 'PENDING') return 'PENDING';
  return s.toUpperCase();
}

export function isApassActive(status) {
  return normalizeApassStatus(status) === 'ACTIVE' || normalizeApassStatus(status) === 'PENDING';
}

export function isApassFrozen(status) {
  return normalizeApassStatus(status) === 'FROZEN';
}
