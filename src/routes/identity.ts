import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';
import { getIdentityService } from '../services/identity';
import { prisma } from '../config/database';
import { getAuthService } from '../services/auth';
import { 
  onboardRequestSchema, 
  statusRequestSchema,
  verifyRequestSchema,
  eligibilityRequestSchema,
  freezeRequestSchema,
  unfreezeRequestSchema 
} from '../services/auth/schemas';
import { logger } from '../config';

const router = Router();
const identityService = getIdentityService();
const authService = getAuthService();

/**
 * POST /identity/onboard
 * Create A-Pass for a new user
 * 
 * Body:
 * - signature: EIP-191 signature of the message
 * - message: Signed message containing action details
 * - chain: Blockchain network
 * - userType: BUYER | SUPPLIER | INVESTOR
 * - customerId: Unique customer ID (12+ alphanumeric chars)
 * - identityDataList: Optional KYC documents
 * 
 * The signature is verified to recover the wallet address,
 * which is then used for A-Pass registration.
 */
router.post('/onboard', asyncHandler(async (req: Request, res: Response) => {
  const validated = onboardRequestSchema.parse(req.body);
  
  // Verify signature and recover wallet address
  const authResult = authService.verifySignature(validated.signature, validated.message);
  
  if (!authResult.valid || !authResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid signature',
        details: authResult.error,
      },
    });
  }

  logger.info({ walletAddress: authResult.walletAddress }, 'Identity onboard request');

  const result = await identityService.onboard({
    walletAddress: authResult.walletAddress,
    chain: validated.chain,
    userType: validated.userType,
    customerId: validated.customerId,
    identityDataList: validated.identityDataList,
  });

  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Failed to onboard user',
        details: result.error,
      },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      apassId: result.apassId,
      apassAddress: result.apassAddress,
      status: result.status,
      walletAddress: authResult.walletAddress,
    },
  });

}));
/**
 * GET /identity/profile/:walletAddress
 * Read-only A-Pass profile for dashboard display.
 * Public endpoint: no signature required.
 */
router.get('/profile/:walletAddress', asyncHandler(async (req: Request, res: Response) => {
  const walletAddress = String(req.params.walletAddress).toLowerCase();
  const chain = typeof req.query.chain === 'string' ? req.query.chain : undefined;

  logger.info({ walletAddress }, 'Identity profile request');

  const initialUser = await prisma.user.findUnique({
    where: { walletAddress },
  });

  if (!initialUser) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'User not found',
      },
    });
  }

  const status = await identityService.getStatus(walletAddress);
  const user = await prisma.user.findUnique({
    where: { walletAddress },
  });

  res.json({
    success: true,
    data: {
      walletAddress: user?.walletAddress ?? walletAddress,
      chain: user?.chain ?? chain ?? 'base',
      userType: user?.userType,
      customerId: user?.customerId ?? null,
      email: user?.email ?? null,
      registered: status.registered,
      apassId: status.apassId ?? user?.apassId ?? null,
      apassAddress: user?.apassAddress ?? null,
      apassTxHash: user?.apassTxHash ?? null,
      status: status.status ?? user?.apassStatus ?? null,
      tier: status.tier ?? user?.apassTier ?? null,
      countries: status.countries ?? user?.apassCountries ?? [],
      expirationTime: status.expirationTime ?? (user?.apassExpiration ? Math.floor(user.apassExpiration.getTime() / 1000) : null),
      createdAt: user?.createdAt ?? null,
      updatedAt: user?.updatedAt ?? null,
    },
  });
}));
/**
 * POST /identity/status
 * Get A-Pass status for a wallet
 * 
 * Body:
 * - signature: EIP-191 signature
 * - message: Signed message containing wallet address
 * - walletAddress: Wallet address to check (must match signature)
 * - chain: Blockchain network
 */
router.post('/status', asyncHandler(async (req: Request, res: Response) => {
  const validated = statusRequestSchema.parse(req.body);
  
  // Verify signature
  const authResult = authService.verifySignatureForAddress(
    validated.signature, 
    validated.message,
    validated.walletAddress  // Signature must be from this wallet
  );
  
  if (!authResult.valid || !authResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid signature',
        details: authResult.error,
      },
    });
  }

  logger.info({ walletAddress: validated.walletAddress }, 'Identity status request');

  const status = await identityService.getStatus(validated.walletAddress);

  res.json({
    success: true,
    data: {
      walletAddress: validated.walletAddress,
      registered: status.registered,
      apassId: status.apassId,
      status: status.status,
      tier: status.tier,
      countries: status.countries,
      expirationTime: status.expirationTime,
    },
  });
}));

/**
 * POST /identity/verify
 * Verify A-Pass for a wallet (for gating purposes)
 * 
 * Body:
 * - signature: EIP-191 signature
 * - message: Signed message
 * - chain: Blockchain network
 */
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const validated = verifyRequestSchema.parse(req.body);
  
  // Verify signature and recover wallet address
  const authResult = authService.verifySignature(validated.signature, validated.message);
  
  if (!authResult.valid || !authResult.walletAddress) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid signature',
        details: authResult.error,
      },
    });
  }

  logger.info({ walletAddress: authResult.walletAddress }, 'Identity verify request');

  const result = await identityService.verifyAPass(
    authResult.walletAddress,
    validated.chain
  );

  res.json({
    success: true,
    data: {
      walletAddress: authResult.walletAddress,
      valid: result.valid,
      tier: result.tier,
      countries: result.countries,
      reason: result.reason,
    },
  });
}));

/**
 * POST /identity/eligibility
 * Check investment eligibility for a deal
 * 
 * Body:
 * - signature: EIP-191 signature
 * - message: Signed message
 * - walletAddress: Wallet address to check
 * - dealId: Deal ID to check eligibility for
 */
router.post('/eligibility', asyncHandler(async (req: Request, res: Response) => {
  const validated = eligibilityRequestSchema.parse(req.body);
  
  // Verify signature matches the wallet address
  const authResult = authService.verifySignatureForAddress(
    validated.signature,
    validated.message,
    validated.walletAddress
  );
  
  if (!authResult.valid) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid signature',
        details: authResult.error,
      },
    });
  }

  logger.info({ walletAddress: validated.walletAddress, dealId: validated.dealId }, 'Eligibility check request');

  const result = await identityService.checkDealEligibility({
    walletAddress: validated.walletAddress,
    dealId: validated.dealId,
  });

  res.json({
    success: true,
    data: {
      walletAddress: validated.walletAddress,
      dealId: validated.dealId,
      eligible: result.eligible,
      reason: result.reason,
      tier: result.tier,
      countries: result.countries,
    },
  });
}));

/**
 * POST /identity/freeze
 * Freeze a user's A-Pass (admin only, for compliance)
 * 
 * Body:
 * - signature: Admin EIP-191 signature
 * - message: Signed message
 * - targetWallet: Wallet address to freeze
 * - chain: Blockchain network
 * - reason: Reason for freezing
 */
router.post('/freeze', asyncHandler(async (req: Request, res: Response) => {
  const validated = freezeRequestSchema.parse(req.body);
  
  // Verify admin signature
  const authResult = await authService.verifyAdminSignature(validated.signature, validated.message);
  
  if (!authResult.valid || !authResult.isAdmin) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Forbidden - admin access required',
        details: authResult.error,
      },
    });
  }

  logger.info({ 
    adminWallet: authResult.walletAddress,
    targetWallet: validated.targetWallet,
    reason: validated.reason 
  }, 'Freeze request');

  const success = await identityService.freeze(
    validated.targetWallet,
    validated.chain,
    validated.reason
  );

  if (!success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Failed to freeze A-Pass',
      },
    });
  }

  res.json({
    success: true,
    data: {
      targetWallet: validated.targetWallet,
      status: 'FROZEN',
    },
  });
}));

/**
 * POST /identity/unfreeze
 * Unfreeze a user's A-Pass (admin only)
 * 
 * Body:
 * - signature: Admin EIP-191 signature
 * - message: Signed message
 * - targetWallet: Wallet address to unfreeze
 * - chain: Blockchain network
 */
router.post('/unfreeze', asyncHandler(async (req: Request, res: Response) => {
  const validated = unfreezeRequestSchema.parse(req.body);
  
  // Verify admin signature
  const authResult = await authService.verifyAdminSignature(validated.signature, validated.message);
  
  if (!authResult.valid || !authResult.isAdmin) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Forbidden - admin access required',
        details: authResult.error,
      },
    });
  }

  logger.info({ 
    adminWallet: authResult.walletAddress,
    targetWallet: validated.targetWallet 
  }, 'Unfreeze request');

  const success = await identityService.unfreeze(
    validated.targetWallet,
    validated.chain
  );

  if (!success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Failed to unfreeze A-Pass',
      },
    });
  }

  res.json({
    success: true,
    data: {
      targetWallet: validated.targetWallet,
      status: 'ACTIVE',
    },
  });
}));

export default router;
