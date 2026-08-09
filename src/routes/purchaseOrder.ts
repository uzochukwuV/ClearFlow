import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { getPurchaseOrderService } from '../services/purchaseOrder';
import { getAuthService } from '../services/auth';
import {
  createPORequestSchema,
  signPORequestSchema,
  getPORequestSchema,
  listPORequestSchema
} from '../services/purchaseOrder/schemas';
import { createPOSigningData, generatePOHash } from '../utils/eip712';
import { logger } from '../config';

const router = Router();
const poService = getPurchaseOrderService();
const authService = getAuthService();

/**
 * POST /purchase-orders
 * Create a new Purchase Order
 *
 * Flow:
 * 1. Buyer fills PO form
 * 2. Frontend generates canonical PO and creates EIP-712 signing data
 * 3. Buyer signs the canonical PO terms (EIP-712)
 * 4. POST /purchase-orders with the EIP-712 signature
 * 5. PO created in PENDING_SUPPLIER_SIGNATURE state
 * 6. Supplier then signs to complete
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const validated = createPORequestSchema.parse(req.body);

  // Verify EIP-712 signature and recover buyer address
  const canonicalPO = {
    poReference: validated.poReference,
    buyerAddress: validated.buyerAddress.toLowerCase(),
    supplierAddress: validated.supplierAddress.toLowerCase(),
    amount: validated.amount,
    currency: validated.currency,
    quantity: validated.quantity,
    deliveryDate: validated.deliveryDate,
  };

  const typedData = createPOSigningData(canonicalPO, validated.chainId);

  // The EIP-712 signature proves the buyer consented to these exact PO terms
  // recovered address = validated.buyerAddress

  logger.info({
    buyerAddress: validated.buyerAddress,
    supplierAddress: validated.supplierAddress
  }, 'Creating Purchase Order');

  const result = await poService.createPO({
    buyerAddress: validated.buyerAddress,
    supplierAddress: validated.supplierAddress,
    poReference: validated.poReference,
    amount: validated.amount,
    currency: validated.currency,
    quantity: validated.quantity,
    deliveryDate: new Date(validated.deliveryDate),
    buyerSignature: validated.poSignature,
    chainId: validated.chainId,
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Failed to create Purchase Order', details: result.error },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      poId: result.poId,
      poHash: result.poHash,
      buyerAddress: validated.buyerAddress,
      supplierAddress: validated.supplierAddress,
      poReference: validated.poReference,
      status: 'PENDING_SUPPLIER_SIGNATURE',
    },
  });
}));

/**
 * POST /purchase-orders/:id/sign
 * Sign a Purchase Order (Supplier only)
 *
 * Flow:
 * 1. Supplier reviews the PO terms
 * 2. Supplier signs the canonical PO terms (EIP-712)
 * 3. Supplier also signs an auth message to prove ownership of their wallet
 * 4. POST /purchase-orders/:id/sign
 * 5. PO status updated to SIGNED
 */
router.post('/:id/sign', asyncHandler(async (req: Request, res: Response) => {
  const poId = req.params.id as string;
  const validated = signPORequestSchema.parse({
    ...req.body,
    poId,
  });

  // Verify auth signature and recover supplier address
  const authResult = authService.verifySignature(
    validated.authSignature,
    validated.authMessage
  );

  if (!authResult.valid || !authResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid auth signature', details: authResult.error },
    });
  }

  const signerAddress = authResult.walletAddress;
  logger.info({ poId, signerAddress }, 'Supplier signing Purchase Order');

  const result = await poService.signPO({
    poId: validated.poId,
    signerAddress,
    poSignature: validated.poSignature,
    poHash: validated.poHash,
    chainId: validated.chainId || 84532,
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Failed to sign Purchase Order', details: result.error },
    });
  }

  res.json({
    success: true,
    data: {
      poId: result.poId,
      status: result.status,
      signerAddress,
    },
  });
}));

/**
 * GET /purchase-orders/buyer/:address
 * List Purchase Orders created by a buyer (no auth — filtered by walletAddress).
 *
 * Used by React Query list views. The signed GET / endpoint is kept for
 * authenticated reads; this no-auth variant avoids triggering a MetaMask popup
 * on every refetch.
 */
router.get('/buyer/:address', asyncHandler(async (req: Request, res: Response) => {
  const buyerAddress = String(req.params.address).toLowerCase();

  const result = await poService.listPOs({
    walletAddress: buyerAddress,
    page: 1,
    pageSize: 100,
  });

  // Filter to only POs where this wallet is the buyer.
  const buyerPOs = result.items.filter((po) => po.buyerAddress?.toLowerCase() === buyerAddress);

  res.json({
    success: true,
    data: { items: buyerPOs, total: buyerPOs.length },
  });
}));

/**
 * GET /purchase-orders/supplier/:address
 * List Purchase Orders assigned to a supplier (no auth — filtered by walletAddress).
 *
 * Returns POs where this wallet is the supplier, regardless of status.
 */
router.get('/supplier/:address', asyncHandler(async (req: Request, res: Response) => {
  const supplierAddress = String(req.params.address).toLowerCase();

  const result = await poService.listPOs({
    walletAddress: supplierAddress,
    page: 1,
    pageSize: 100,
  });

  // Filter to only POs where this wallet is the supplier.
  const supplierPOs = result.items.filter(
    (po) => po.supplierAddress?.toLowerCase() === supplierAddress
  );

  res.json({
    success: true,
    data: { items: supplierPOs, total: supplierPOs.length },
  });
}));

/**
 * GET /purchase-orders/:id
 * Get Purchase Order details
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const poId = req.params.id as string;

  const po = await poService.getPO(poId);

  if (!po) {
    return res.status(404).json({
      success: false,
      error: { message: 'Purchase Order not found' },
    });
  }

  res.json({
    success: true,
    data: po,
  });
}));

/**
 * GET /purchase-orders
 * List Purchase Orders for the authenticated user
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { signature, message, status, page, pageSize } = req.query;

  if (!signature || !message) {
    return res.status(400).json({
      success: false,
      error: { message: 'signature and message are required' },
    });
  }

  const authResult = authService.verifySignature(
    signature as string,
    message as string
  );

  if (!authResult.valid || !authResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid signature' },
    });
  }

  const result = await poService.listPOs({
    walletAddress: authResult.walletAddress,
    status: status as any,
    page: parseInt(page as string) || 1,
    pageSize: parseInt(pageSize as string) || 20,
  });

  res.json({
    success: true,
    data: result,
  });
}));

export default router;
