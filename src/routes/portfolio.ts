import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config';

const router = Router();

/**
 * GET /portfolio/:address
 * 
 * Get investor portfolio summary
 */
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get user
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get all contributions
    const contributions = await prisma.contribution.findMany({
      where: { investorId: user.id, status: 'CONFIRMED' },
      include: {
        deal: {
          select: {
            id: true,
            status: true,
            yieldPercent: true,
            targetAmount: true,
            atokenSymbol: true,
            purchaseOrder: {
              select: { poReference: true },
            },
            repayments: {
              where: { paidAt: { not: null } },
              select: { amount: true },
            },
          },
        },
      },
    });

    // Get all investor payouts
    const investorPayouts = await prisma.investorPayout.findMany({
      where: { investorId: user.id },
    });

    // Calculate portfolio stats
    const totalInvested = contributions.reduce((sum, c) => 
      sum + parseFloat(c.amount), 0
    );

    const activeContributions = contributions.filter(c => 
      ['OPEN', 'FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT'].includes(c.deal.status)
    );
    
    const activeDeals = new Set(activeContributions.map(c => c.dealId)).size;
    const totalInvestedActive = activeContributions.reduce((sum, c) => 
      sum + parseFloat(c.amount), 0
    );

    // Calculate yield
    let totalYieldEarned = 0;
    let pendingYield = 0;

    for (const c of contributions) {
      const yieldRate = c.deal.yieldPercent / 100;
      
      if (c.deal.status === 'COMPLETED') {
        totalYieldEarned += parseFloat(c.amount) * yieldRate;
      } else if (['FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT', 'READY_FOR_DISTRIBUTION'].includes(c.deal.status)) {
        // Approximate yield for active deals
        pendingYield += parseFloat(c.amount) * yieldRate * 0.5; // Rough estimate
      }
    }

    // For claimed payouts
    const claimedPayouts = investorPayouts.filter(p => p.status === 'CLAIMED');
    totalYieldEarned = claimedPayouts.reduce((sum, p) => 
      sum + parseFloat(p.yieldAmount), 0
    );

    const pendingPayouts = investorPayouts.filter(p => p.status === 'PENDING');
    pendingYield = pendingPayouts.reduce((sum, p) => 
      sum + parseFloat(p.yieldAmount), 0
    );

    res.json({
      success: true,
      data: {
        investorAddress: user.walletAddress,
        portfolio: {
          totalInvested,
          totalInvestedActive,
          totalYieldEarned,
          pendingYield,
          estimatedTotal: totalInvested + totalYieldEarned + pendingYield,
          activeDeals,
        },
        breakdown: {
          active: activeContributions.map(c => ({
            dealId: c.dealId,
            atokenSymbol: c.deal.atokenSymbol,
            poReference: c.deal.purchaseOrder.poReference,
            invested: parseFloat(c.amount),
            yieldRate: c.deal.yieldPercent,
            estimatedYield: parseFloat(c.amount) * (c.deal.yieldPercent / 100),
            dealStatus: c.deal.status,
          })),
        },
        claims: {
          pending: pendingPayouts.length,
          totalPendingClaim: pendingPayouts.reduce((sum, p) => sum + parseFloat(p.total), 0),
          claimed: claimedPayouts.length,
          totalClaimed: claimedPayouts.reduce((sum, p) => sum + parseFloat(p.total), 0),
        },
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Get portfolio error');
    res.status(500).json({ success: false, error: 'Failed to get portfolio' });
  }
});

/**
 * GET /portfolio/:address/holdings
 * 
 * Get detailed token holdings for an investor
 */
router.get('/:address/holdings', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get user
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get all contributions with deal info
    const contributions = await prisma.contribution.findMany({
      where: { investorId: user.id, status: 'CONFIRMED' },
      include: {
        deal: {
          select: {
            id: true,
            status: true,
            targetAmount: true,
            runningTotal: true,
            yieldPercent: true,
            atokenSymbol: true,
            totalSupply: true,
            fundingDeadline: true,
            deliveryDeadline: true,
            purchaseOrder: {
              select: { poReference: true },
            },
            repayments: {
              where: { paidAt: { not: null } },
              select: { amount: true, paidAt: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get investor payouts for claim status
    const investorPayouts = await prisma.investorPayout.findMany({
      where: { investorId: user.id },
    });
    const payoutsMap = new Map(investorPayouts.map(p => [p.dealId, p]));

    // Format holdings
    const holdings = contributions.map(c => {
      const payout = payoutsMap.get(c.dealId);
      const isRepaid = c.deal.repayments.length > 0;
      const canClaim = payout?.status === 'PENDING' && isRepaid;
      
      const principal = parseFloat(c.amount);
      const yieldAmount = principal * (c.deal.yieldPercent / 100);
      const totalValue = principal + yieldAmount;

      return {
        dealId: c.dealId,
        contributionId: c.id,
        atokenSymbol: c.deal.atokenSymbol,
        poReference: c.deal.purchaseOrder.poReference,
        tokenAmount: principal,
        contributionAmount: principal,
        dealStatus: c.deal.status,
        yieldPercent: c.deal.yieldPercent,
        yieldAccrued: yieldAmount,
        estimatedReturn: totalValue,
        canClaim,
        claimableAmount: canClaim ? totalValue : null,
        payoutStatus: payout?.status || 'PENDING',
        fundedPercent: Math.round(
          (parseFloat(c.deal.runningTotal.toString()) / parseFloat(c.deal.targetAmount.toString())) * 100
        ),
        fundingDeadline: c.deal.fundingDeadline,
        deliveryDeadline: c.deal.deliveryDeadline,
        lastRepaymentAt: c.deal.repayments[0]?.paidAt || null,
      };
    });

    // Group by status
    const activeHoldings = holdings.filter(h => 
      ['OPEN', 'FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT', 'READY_FOR_DISTRIBUTION'].includes(h.dealStatus)
    );
    
    const completedHoldings = holdings.filter(h => h.dealStatus === 'COMPLETED');
    const claimableHoldings = holdings.filter(h => h.canClaim);

    res.json({
      success: true,
      data: {
        investorAddress: user.walletAddress,
        holdings,
        summary: {
          total: holdings.length,
          active: activeHoldings.length,
          completed: completedHoldings.length,
          claimable: claimableHoldings.length,
        },
        claimable: claimableHoldings,
        active: activeHoldings,
        completed: completedHoldings,
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Get holdings error');
    res.status(500).json({ success: false, error: 'Failed to get holdings' });
  }
});

/**
 * GET /portfolio/:address/contributions
 * 
 * Get contribution history for an investor
 */
router.get('/:address/contributions', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get user
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get all contributions
    const contributions = await prisma.contribution.findMany({
      where: { investorId: user.id },
      include: {
        deal: {
          select: {
            id: true,
            status: true,
            targetAmount: true,
            runningTotal: true,
            yieldPercent: true,
            atokenSymbol: true,
            purchaseOrder: {
              select: { poReference: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = contributions.map(c => ({
      contributionId: c.id,
      dealId: c.dealId,
      atokenSymbol: c.deal.atokenSymbol,
      poReference: c.deal.purchaseOrder.poReference,
      amount: parseFloat(c.amount),
      currency: c.currency,
      type: c.type,
      status: c.status,
      dealStatus: c.deal.status,
      yieldPercent: c.deal.yieldPercent,
      fundedPercent: Math.round(
        (parseFloat(c.deal.runningTotal.toString()) / parseFloat(c.deal.targetAmount.toString())) * 100
      ),
      txHash: c.txHash,
      rampReceiptId: c.rampReceiptId,
      confirmedAt: c.confirmedAt,
      createdAt: c.createdAt,
    }));

    res.json({
      success: true,
      data: {
        investorAddress: user.walletAddress,
        contributions: formatted,
        stats: {
          total: contributions.length,
          confirmed: contributions.filter(c => c.status === 'CONFIRMED').length,
          pending: contributions.filter(c => c.status === 'PENDING').length,
          totalAmount: contributions
            .filter(c => c.status === 'CONFIRMED')
            .reduce((sum, c) => sum + parseFloat(c.amount), 0),
        },
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Get contributions error');
    res.status(500).json({ success: false, error: 'Failed to get contributions' });
  }
});

export default router;
