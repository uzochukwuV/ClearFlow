import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { getDealService } from '../services/deal';
import { getAuthService } from '../services/auth';
import { 
  createDealRequestSchema,
  contributeRequestSchema,
  getDealRequestSchema,
  listDealsRequestSchema,
  getPositionsRequestSchema,
  getEligibilityRequestSchema
} from '../services/deal/schemas';
import { logger } from '../config';

const router = Router();
const dealService = getDealService();
const authService = getAuthService();

/**
 * POST /deals
 * Create a Financing Deal from a signed Purchase Order
 * 
 * Flow:
 * 1. Verifies PO is signed by both buyer and supplier
 * 2. Creates deal in database
 * 3. Mints ONE POF A-Token series for the deal
 * 4. Creates Circle deal wallet
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const validated = createDealRequestSchema.parse(req.body);
  
  // Verify signature and recover buyer address
  const authResult = authService.verifySignature(
    validated.signature,
    validated.message
  );
  
  if (!authResult.valid || !authResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid signature', details: authResult.error },
    });
  }

  logger.info({ 
    buyerAddress: authResult.walletAddress,
    purchaseOrderId: validated.purchaseOrderId 
  }, 'Creating Financing Deal');

  const result = await dealService.createDeal({
    buyerAddress: authResult.walletAddress,
    purchaseOrderId: validated.purchaseOrderId,
    targetAmount: validated.targetAmount,
    yieldPercent: validated.yieldPercent,
    fundingDeadline: new Date(validated.fundingDeadline),
    deliveryDeadline: validated.deliveryDeadline ? new Date(validated.deliveryDeadline) : undefined,
    minInvestorTier: validated.minInvestorTier,
    eligibleCountries: validated.eligibleCountries,
    chain: 'monad',
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Failed to create deal', details: result.error },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      dealId: result.dealId,
      atokenSymbol: result.atokenSymbol,
      status: 'OPEN',
    },
  });
}));

/**
 * POST /deals/:id/contribute
 * Contribute to a Financing Deal
 * 
 * Investor contributes USDC and receives POF tokens.
 * Investor must have A-Pass meeting compliance rules.
 */
router.post('/:id/contribute', asyncHandler(async (req: Request, res: Response) => {
  const dealId = req.params.id as string;
  const validated = contributeRequestSchema.parse({
    ...req.body,
    dealId,
  });
  
  // Verify INVESTOR signature and recover investor address
  const investorAuthResult = authService.verifySignature(
    validated.investorSignature,
    validated.investorMessage
  );
  
  if (!investorAuthResult.valid || !investorAuthResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid investor signature', details: investorAuthResult.error },
    });
  }

  // Verify ADMIN signature and recover admin address
  const adminAuthResult = authService.verifySignature(
    validated.adminSignature,
    validated.adminMessage
  );
  
  if (!adminAuthResult.valid || !adminAuthResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid admin signature', details: adminAuthResult.error },
    });
  }

  logger.info({ 
    investorAddress: investorAuthResult.walletAddress,
    adminAddress: adminAuthResult.walletAddress,
    dealId,
    amount: validated.amount 
  }, 'Processing contribution with dual signatures');

  const result = await dealService.contribute({
    investorAddress: investorAuthResult.walletAddress,
    adminAddress: adminAuthResult.walletAddress,
    dealId: validated.dealId,
    amount: validated.amount,
    chain: 'monad',
    paymentMethod: validated.paymentMethod,
    fiatCurrency: validated.fiatCurrency,
    partnerCustomerId: validated.partnerCustomerId,
    mintTokensOnConfirm: validated.mintTokensOnConfirm,
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Failed to contribute', details: result.error },
    });
  }

  res.json({
    success: true,
    data: {
      contributionId: result.contributionId,
      contributionStatus: result.contributionStatus,
      tokenAmount: result.tokenAmount,
      dealWalletAddress: result.dealWalletAddress,
      txHash: result.txHash,
      rampOrderId: result.rampOrderId,
      rampQuoteToken: result.rampQuoteToken,
      rampWidgetUrl: result.rampWidgetUrl,
      rampTxHash: result.rampTxHash,
    },
  });
}));

/**
 * GET /deals/:id
 * Get Deal details
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const dealId = req.params.id as string;
  const { signature, message } = req.query;
  
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
  
  if (!authResult.valid) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid signature' },
    });
  }

  const deal = await dealService.getDeal(dealId);
  
  if (!deal) {
    return res.status(404).json({
      success: false,
      error: { message: 'Deal not found' },
    });
  }

  res.json({
    success: true,
    data: deal,
  });
}));

/**
 * GET /deals
 * List Deals
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
  
  if (!authResult.valid) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid signature' },
    });
  }

  res.json({
    success: true,
    data: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    },
  });
}));

/**
 * GET /deals/my/positions
 * Get investor's positions (POF tokens)
 */
router.get('/my/positions', asyncHandler(async (req: Request, res: Response) => {
  const { signature, message } = req.query;
  
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

  const positions = await dealService.getInvestorPositions(authResult.walletAddress);

  res.json({
    success: true,
    data: positions,
  });
}));

/**
 * GET /deals/:id/eligibility
 * Check eligibility for a deal
 */
router.get('/:id/eligibility', asyncHandler(async (req: Request, res: Response) => {
  const dealId = req.params.id as string;
  const { signature, message, walletAddress } = req.query;
  
  if (!signature || !message || !walletAddress) {
    return res.status(400).json({
      success: false,
      error: { message: 'signature, message, and walletAddress are required' },
    });
  }
  
  const authResult = authService.verifySignature(
    signature as string,
    message as string
  );
  
  if (!authResult.valid) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid signature' },
    });
  }

  const result = await dealService.checkEligibility({
    walletAddress: walletAddress as string,
    dealId,
    chain: 'monad',
  });

  res.json({
    success: true,
    data: {
      eligible: result.eligible,
      reason: result.reason,
    },
  });
}));

/**
 * GET /deals/:id/deposit-address
 * Get Circle deposit address for a deal
 */
router.get('/:id/deposit-address', asyncHandler(async (req: Request, res: Response) => {
  const dealId = req.params.id as string;
  const { signature, message } = req.query;
  
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
  
  if (!authResult.valid) {
    return res.status(401).json({
      success: false,
      error: { message: 'Invalid signature' },
    });
  }

  const deal = await dealService.getDeal(dealId);
  
  if (!deal) {
    return res.status(404).json({
      success: false,
      error: { message: 'Deal not found' },
    });
  }

  res.json({
    success: true,
    data: {
      dealId,
      depositAddress: deal.circleWalletAddress,
    },
  });
}));

export default router;
