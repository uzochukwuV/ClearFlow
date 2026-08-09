import { Router, Request, Response } from 'express';
import { getFundingService } from '../services/funding/funding.service';
import { logger } from '../config';

const router = Router();
const fundingService = getFundingService();

/**
 * GET /funding/contributions/:contributionId
 *
 * Get a single contribution's status + verification details.
 * Frontend polls this after POST /deals/:id/contribute returns a PENDING
 * contribution to know when the deposit is confirmed and tokens are minted.
 */
router.get('/contributions/:contributionId', async (req: Request, res: Response) => {
  try {
    const contributionId = req.params.contributionId as string;
    const { prisma } = await import('../config/database');

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      include: { deal: true, investor: true },
    });

    if (!contribution) {
      return res.status(404).json({ success: false, error: 'Contribution not found' });
    }

    res.json({
      success: true,
      contribution: {
        id: contribution.id,
        dealId: contribution.dealId,
        type: contribution.type,
        status: contribution.status,
        amount: contribution.amount,
        currency: contribution.currency,
        // Deposit provenance (populated on confirmation)
        txHash: contribution.txHash,
        fromAddress: contribution.fromAddress,
        toAddress: contribution.toAddress,
        confirmedAt: contribution.confirmedAt,
        // Ramp (FIAT path)
        rampOrderId: contribution.rampOrderId,
        rampQuoteToken: contribution.rampQuoteToken,
        rampTxHash: contribution.rampTxHash,
        // Deal context for display
        dealWalletAddress: contribution.deal.circleWalletAddress,
        atokenSymbol: contribution.deal.atokenSymbol,
        dealStatus: contribution.deal.status,
        dealTarget: contribution.deal.targetAmount.toString(),
        dealRunningTotal: contribution.deal.runningTotal.toString(),
        createdAt: contribution.createdAt,
        updatedAt: contribution.updatedAt,
      },
    });
  } catch (error) {
    logger.error({ error, contributionId: req.params.contributionId }, 'Get contribution error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

/**
 * POST /funding/contributions/:contributionId/verify
 *
 * Manually trigger a deposit verification check for a contribution (admin/cron).
 * Returns the verification result. On success the background job will also
 * mint tokens; this endpoint just reports the current verification state.
 */
router.post('/contributions/:contributionId/verify', async (req: Request, res: Response) => {
  try {
    const contributionId = req.params.contributionId as string;
    const { getDepositVerificationService } = await import('../services/funding');
    const { prisma } = await import('../config/database');

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: { type: true, status: true },
    });
    if (!contribution) {
      return res.status(404).json({ success: false, error: 'Contribution not found' });
    }
    if (contribution.status === 'CONFIRMED') {
      return res.json({ success: true, verified: true, status: 'CONFIRMED', message: 'Already confirmed' });
    }

    const verificationService = getDepositVerificationService();
    const result = contribution.type === 'FIAT'
      ? await verificationService.verifyFiatDeposit(contributionId)
      : await verificationService.verifyCryptoDeposit(contributionId);

    res.json({
      success: true,
      verified: result.verified,
      status: result.verified ? 'CONFIRMED' : 'PENDING',
      txHash: result.txHash,
      error: result.error,
    });
  } catch (error) {
    logger.error({ error, contributionId: req.params.contributionId }, 'Verify contribution error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

/**
 * GET /funding/deals/:dealId/summary
 * 
 * Get funding summary for a deal
 */
router.get('/deals/:dealId/summary', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    const summary = await fundingService.getFundingSummary(dealId);

    res.json({ success: true, summary });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Get funding summary error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * GET /funding/deals/:dealId/events
 * 
 * Get funding events for a deal
 */
router.get('/deals/:dealId/events', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const events = await fundingService.getFundingEvents(dealId, limit);

    res.json({ success: true, events });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Get funding events error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /funding/deals/:dealId/settle
 * 
 * Initiate settlement for a fully funded deal
 */
router.post('/deals/:dealId/settle', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const { supplierAddress } = req.body;

    // Verify request is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const result = await fundingService.initiateSettlement(dealId, supplierAddress);

    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Settlement initiated',
        transferId: result.transferId 
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Settlement error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /funding/deals/:dealId/refund
 * 
 * Process refunds for expired/cancelled deal
 * Admin only
 */
router.post('/deals/:dealId/refund', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    const result = await fundingService.processRefunds(dealId);

    res.json({ success: result.success, refunds: result.refunds, error: result.error });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Refund error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * GET /funding/investor/:address/positions
 * 
 * Get all deal positions for an investor
 */
router.get('/investor/:address/positions', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const { prisma } = await import('../config/database');

    const contributions = await prisma.contribution.findMany({
      where: { fromAddress: address.toLowerCase() },
      include: { deal: true },
      orderBy: { createdAt: 'desc' },
    });

    const positions = contributions.map(c => ({
      dealId: c.dealId,
      dealSymbol: c.deal.atokenSymbol,
      amount: c.amount.toString(),
      status: c.status,
      contributedAt: c.createdAt,
      dealStatus: c.deal.status,
      dealTarget: c.deal.targetAmount.toString(),
      dealRunningTotal: c.deal.runningTotal.toString(),
      fundingPercentage: (c.deal.runningTotal.toNumber() / c.deal.targetAmount.toNumber()) * 100,
    }));

    res.json({ success: true, positions });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Get positions error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /funding/expired/process
 * 
 * Process all expired deals (admin/cron endpoint)
 */
router.post('/expired/process', async (req: Request, res: Response) => {
  try {
    const result = await fundingService.processExpiredDeals();

    res.json({ 
      success: true, 
      processed: result.processed,
      expired: result.expired 
    });
  } catch (error) {
    logger.error({ error }, 'Process expired deals error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

export default router;
