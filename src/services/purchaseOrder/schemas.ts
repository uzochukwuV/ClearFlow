import { z } from 'zod';

/**
 * Create PO Intent Request
 * 
 * This is the FIRST step - proves "this wallet wants to create a PO with these details"
 * Signature is on an intent message, not the actual PO terms.
 * 
 * After this:
 * - Backend generates canonical PO
 * - Backend creates PO in PENDING_SUPPLIER_SIGNATURE state
 * - Supplier then signs the actual PO terms
 */
export const createPOIntentSchema = z.object({
  // Intent message (standard EIP-191)
  intentSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid intent signature'),
  intentMessage: z.string().min(1, 'Intent message is required'),
  
  // PO details (committed in intent signature)
  supplierAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid supplier address'),
  poReference: z.string().min(1, 'PO reference is required'),
  amount: z.string().min(1, 'Amount is required'),
  currency: z.string().default('USD'),
  quantity: z.number().int().positive(),
  deliveryDate: z.string(),
  chainId: z.number().int().positive().default(84532),
});

/**
 * Create PO with Buyer Signature
 * 
 * This is the FULL flow - buyer signs the actual PO terms (EIP-712)
 * No second signature needed from buyer.
 * 
 * Flow:
 * 1. Buyer fills PO form
 * 2. Backend generates canonical PO and hash
 * 3. Buyer signs PO terms with EIP-712
 * 4. POST /purchase-orders with EIP-712 signature
 * 5. PO created in PENDING_SUPPLIER_SIGNATURE state
 * 6. Supplier signs to complete
 */
export const createPORequestSchema = z.object({
  // EIP-712 signature over canonical PO terms
  poSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-712 signature'),
  
  // The canonical PO terms (must match what was signed)
  poReference: z.string().min(1, 'PO reference is required'),
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid buyer address'),
  supplierAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid supplier address'),
  amount: z.string().min(1, 'Amount is required'),
  currency: z.string().default('USD'),
  quantity: z.number().int().positive(),
  deliveryDate: z.string(),
  chainId: z.number().int().positive().default(84532),
  
  // Intent signature (proves this wallet initiated this action)
  intentSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid intent signature').optional(),
  intentMessage: z.string().optional(),
});

/**
 * Sign PO Request (for Supplier)
 * 
 * Supplier signs the canonical PO terms.
 * The message contains the PO hash to cryptographically commit to the terms.
 */
export const signPORequestSchema = z.object({
  // EIP-712 signature over canonical PO terms
  poSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-712 signature'),
  
  // PO identifier
  poId: z.string().uuid('Invalid PO ID'),
  
  // Commitment: hash of the signed PO terms
  poHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid PO hash'),
  
  // Chain ID for EIP-712
  chainId: z.number().int().positive().default(84532),
  
  // Standard EIP-191 signature for authentication
  authSignature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid auth signature'),
  authMessage: z.string().min(1, 'Auth message is required'),
});

/**
 * Get PO Request
 */
export const getPORequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  poId: z.string().uuid('Invalid PO ID'),
});

/**
 * List POs Request
 */
export const listPORequestSchema = z.object({
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/, 'Invalid EIP-191 signature'),
  message: z.string().min(1, 'Message is required'),
  status: z.enum(['DRAFT', 'PENDING_SUPPLIER_SIGNATURE', 'PENDING_BUYER_SIGNATURE', 'SIGNED', 'CANCELLED']).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
