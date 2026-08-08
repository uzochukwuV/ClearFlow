import { z } from 'zod';

// Signature message schema for authentication
export const authSignatureSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
});

// Message types for different actions
export const MessageType = {
  ONBOARD: 'ONBOARD',
  SIGN_PO: 'SIGN_PO',
  CONTRIBUTE: 'CONTRIBUTE',
  VERIFY: 'VERIFY',
  STATUS: 'STATUS',
  ELIGIBILITY: 'ELIGIBILITY',
} as const;

// Generate authentication message for a specific action
export function generateAuthMessage(
  type: keyof typeof MessageType,
  params: Record<string, string>
): string {
  const timestamp = Date.now();
  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  
  return `${MessageType[type]}:${paramString}:${timestamp}`;
}

// Onboard request - wallet signs intent
export const onboardRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  chain: z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana']).default('polygon'),
  userType: z.enum(['BUYER', 'SUPPLIER', 'INVESTOR', 'PLATFORM']),
  customerId: z.string().min(12).regex(/^[A-Za-z0-9]+$/, 'customerId must be alphanumeric, 12+ chars'),
  identityDataList: z.array(z.object({
    idType: z.enum(['ID_CARD', 'PASSPORT', 'DRIVER_LICENSE', 'RESIDENCE_PERMIT']),
    fullName: z.string().min(1, 'Full name is required'),
    issuingCountryISO2: z.string().length(2).toUpperCase(),
  })).optional(),
});

// Sign PO request
export const signPORequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  poId: z.string().uuid(),
  signerType: z.enum(['BUYER', 'SUPPLIER']),
});

// Contribute request
export const contributeRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  dealId: z.string().uuid(),
  amount: z.string().min(1, 'Amount is required'),
  currency: z.string().default('USDC'),
});

// Verify request (generic)
export const verifyRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  chain: z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana']).default('polygon'),
});

// Status check request
export const statusRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  chain: z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana']).default('polygon'),
});

// Eligibility check request
export const eligibilityRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  dealId: z.string().uuid(),
});

// Freeze request (admin)
export const freezeRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  targetWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid target wallet address'),
  chain: z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana']).default('polygon'),
  reason: z.string().min(1, 'Reason is required'),
});

// Unfreeze request (admin)
export const unfreezeRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  targetWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid target wallet address'),
  chain: z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana']).default('polygon'),
});
