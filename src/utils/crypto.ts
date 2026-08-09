import { ethers } from 'ethers';

// Types for PO
export interface POCanonicalPayload {
  buyer_address: string;
  supplier_address: string;
  quantity: number;
  amount: string;
  delivery_date: string;
  po_reference: string;
}

// Canonicalize PO terms for signing
export function canonicalizePO(po: POCanonicalPayload): string {
  const sortedKeys = Object.keys(po).sort() as (keyof POCanonicalPayload)[];
  const canonicalObj: Record<string, unknown> = {};
  
  for (const key of sortedKeys) {
    if (key === 'buyer_address' || key === 'supplier_address') {
      canonicalObj[key] = po[key].toLowerCase();
    } else {
      canonicalObj[key] = po[key];
    }
  }
  
  return JSON.stringify(canonicalObj);
}

// Hash for EIP-191 signing
export function hashPO(po: POCanonicalPayload): string {
  const canonical = canonicalizePO(po);
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

// Verify EIP-191 signature
export function verifySignature(
  hash: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    const recovered = ethers.verifyMessage(hash, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

// Recover signer address from signature
export function recoverSigner(hash: string, signature: string): string | null {
  try {
    return ethers.verifyMessage(hash, signature);
  } catch {
    return null;
  }
}

// Format USDC amounts (6 decimals)
export function formatUSDC(amount: bigint | string): string {
  const parsed = typeof amount === 'string' ? ethers.parseUnits(amount, 6) : amount;
  return ethers.formatUnits(parsed, 6);
}

// Parse USDC string to bigint (6 decimals)
export function parseUSDC(amount: string): bigint {
  return ethers.parseUnits(amount, 6);
}

// Validate Ethereum address
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

// Get checksum address
export function getChecksumAddress(address: string): string {
  return ethers.getAddress(address);
}

// Generate random bytes (for nonces)
export function randomBytesHex(length: number = 32): string {
  return ethers.randomBytes(length).toString();
}

// Hash transaction data
export function hashData(data: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(data));
}
