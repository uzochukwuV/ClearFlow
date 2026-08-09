import { z } from 'zod';

/**
 * Deal Schemas
 * 
 * Architecture:
 * - A-Pass = Identity/compliance credential (Cleanverse)
 * - PO = Commercial RWA record (buyer + supplier signed)
 * - POF A-Token = Financing position (ONE token series per deal)
 * - Circle Deal Wallet = USDC settlement account
 */

/**
 * Create Deal Request
 * 
 * Creates a financing deal from a signed Purchase Order.
 * Mints ONE POF A-Token series for this deal.
 */
export const createDealRequestSchema = z.object({
  // Auth
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature'),
  message: z.string().min(1, 'Message is required'),
  
  // Deal details
  purchaseOrderId: z.string().uuid('Invalid PO ID'),
  targetAmount: z.string().min(1, 'Target amount is required'),
  yieldPercent: z.number().min(0).max(100),
  fundingDeadline: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  
  // Delivery deadline - when buyer must confirm receipt and pay up
  // Investors know their yield timeframe from this
  deliveryDeadline: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  
  // Compliance rules for POF A-Token
  minInvestorTier: z.number().int().min(0).default(1),
  eligibleCountries: z.array(z.string().length(2)).default([]),
  
  // Chain for A-Token
  chainId: z.number().int().positive().default(84532),
});

/**
 * Contribute to Deal Request
 * 
 * Investor contributes USDC and receives POF tokens.
 * Requires dual signatures:
 * - Investor EIP-712 signature: proves investor owns wallet and agrees to contribution
 * - Admin EIP-712 signature: platform admin approves the contribution
 */
export const contributeRequestSchema = z.object({
  // Investor Auth - proves investor owns the wallet
  investorSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid investor signature'),
  investorMessage: z.string().min(1, 'Investor message is required'),

  // Admin Auth - platform admin approves contribution.
  // OPTIONAL: when omitted, the backend signs server-side with the Circle
  // developer-controlled admin wallet (the admin key is held by Circle, so it
  // cannot sign with MetaMask). When present, it is verified to be the admin.
  adminSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid admin signature').optional(),
  adminMessage: z.string().min(1, 'Admin message is required').optional(),

  // Contribution details
  dealId: z.string().uuid('Invalid deal ID'),
  amount: z.string().min(1, 'Amount is required'),

  // Payment path: CRYPTO (investor sends USDC on-chain) or FIAT (Cleanverse ramp)
  paymentMethod: z.enum(['CRYPTO', 'FIAT']).default('CRYPTO'),
  // FIAT-only inputs (ignored for CRYPTO)
  fiatCurrency: z.string().optional(),
  partnerCustomerId: z.string().optional(),
  // When true, block until the deposit verifies and mint immediately.
  // Default false → return PENDING and verify via background job.
  mintTokensOnConfirm: z.boolean().default(false),

  // Chain
  chainId: z.number().int().positive().default(84532),
});

/**
 * Get Deal Request
 */
export const getDealRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature'),
  message: z.string().min(1, 'Message is required'),
  dealId: z.string().uuid('Invalid deal ID'),
});

/**
 * List Deals Request
 */
export const listDealsRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature'),
  message: z.string().min(1, 'Message is required'),
  status: z.enum([
    'DRAFT', 'OPEN', 'CLOSED_FUNDED', 'CLOSED_SHORTFALL',
    'FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT',
    'COMPLETED', 'DEFAULTED', 'CANCELLED'
  ]).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

/**
 * Get Investor Positions Request
 */
export const getPositionsRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature'),
  message: z.string().min(1, 'Message is required'),
});

/**
 * Get Deal Eligibility Request
 */
export const getEligibilityRequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid signature'),
  message: z.string().min(1, 'Message is required'),
  dealId: z.string().uuid('Invalid deal ID'),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
});
