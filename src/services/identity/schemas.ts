import { z } from 'zod';

// Common schemas
export const walletAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
export const chainSchema = z.enum(['polygon', 'ethereum', 'base', 'arbitrum', 'bsc', 'solana']);
export const userTypeSchema = z.enum(['BUYER', 'SUPPLIER', 'INVESTOR', 'PLATFORM']);

// Onboard identity
export const onboardSchema = z.object({
  walletAddress: walletAddressSchema,
  chain: chainSchema.default('polygon'),
  userType: userTypeSchema,
  customerId: z.string().min(12).regex(/^[A-Za-z0-9]+$/, 'customerId must be alphanumeric, 12+ chars'),
  identityDataList: z.array(z.object({
    idType: z.enum(['ID_CARD', 'PASSPORT', 'DRIVER_LICENSE', 'RESIDENCE_PERMIT']),
    issuingCountryISO2: z.string().length(2).toUpperCase(),
  })).optional(),
});

// Check identity status
export const identityStatusSchema = z.object({
  walletAddress: walletAddressSchema,
});

// Verify identity (for any wallet)
export const verifyIdentitySchema = z.object({
  walletAddress: walletAddressSchema,
  chain: chainSchema.default('polygon'),
});

// Check investment eligibility for a deal
export const checkEligibilitySchema = z.object({
  walletAddress: walletAddressSchema,
  dealId: z.string().uuid(),
});

// Freeze/unfreeze identity
export const updateStatusSchema = z.object({
  walletAddress: walletAddressSchema,
  chain: chainSchema.default('polygon'),
  action: z.enum(['freeze', 'unfreeze']),
  reason: z.string().optional(),
});
