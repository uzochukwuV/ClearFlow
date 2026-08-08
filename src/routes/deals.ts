import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config';

const router = Router();

/**
 * GET /deals
 * 
 * List deals with optional filters
 * Query params:
 * - status: Filter by status (OPEN, FUNDED, etc.)
 * - minYield: Minimum yield percentage
 * - maxAmount: Maximum target amount
 * - country: Filter by eligible country
 * - limit: Number of results (default 20)
 * - offset: Pagination offset
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      minYield,
      maxAmount,
      country,
      limit = '20',
      offset = '0',
    } = req.query;

    // Build where clause
    const where: any = {};

    if (status) {
      if (status === 'OPEN') {
        where.status = { equals: 'OPEN' };
      } else if (status === 'ACTIVE') {
        where.status = { in: ['OPEN', 'FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT'] };
      } else if (status === 'COMPLETED') {
        where.status = { in: ['COMPLETED', 'DEFAULTED'] };
      } else {
        where.status = { equals: status as string };
      }
    }

    // Build include for filtering
    const deals = await prisma.deal.findMany({
      where,
      include: {
        purchaseOrder: {
          select: {
            poReference: true,
            amount: true,
            currency: true,
            buyer: {
              select: {
                walletAddress: true,
                email: true,
              },
            },
            supplier: {
              select: {
                walletAddress: true,
              },
            },
          },
        },
        contributions: {
          select: {
            amount: true,
            status: true,
            investor: {
              select: { walletAddress: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    // Apply post-query filters
    let filteredDeals = deals;

    if (minYield) {
      filteredDeals = filteredDeals.filter(d => d.yieldPercent >= parseInt(minYield as string));
    }

    if (maxAmount) {
      filteredDeals = filteredDeals.filter(d => 
        parseFloat(d.targetAmount.toString()) <= parseFloat(maxAmount as string)
      );
    }

    if (country) {
      const countryFilter = country as string;
      filteredDeals = filteredDeals.filter(d => 
        d.eligibleCountries.length === 0 || (d.eligibleCountries as string[]).includes(countryFilter)
      );
    }

    // Format response
    const formattedDeals = filteredDeals.map(d => {
      const target = parseFloat(d.targetAmount.toString());
      const funded = parseFloat(d.runningTotal.toString());
      const confirmedContributions = d.contributions.filter(c => c.status === 'CONFIRMED');
      const uniqueInvestors = new Set(confirmedContributions.map(c => c.investor.walletAddress)).size;

      return {
        dealId: d.id,
        poReference: d.purchaseOrder.poReference,
        buyerAddress: d.purchaseOrder.buyer.walletAddress,
        buyerEmail: d.purchaseOrder.buyer.email,
        supplierAddress: d.purchaseOrder.supplier.walletAddress,
        poAmount: parseFloat(d.purchaseOrder.amount),
        targetAmount: target,
        fundedAmount: funded,
        fundedPercent: Math.round((funded / target) * 100),
        remainingCapacity: Math.max(0, target - funded),
        currency: d.currency,
        status: d.status,
        yieldPercent: d.yieldPercent,
        atokenSymbol: d.atokenSymbol,
        fundingDeadline: d.fundingDeadline,
        deliveryDeadline: d.deliveryDeadline,
        eligibleCountries: d.eligibleCountries,
        minInvestorTier: d.minInvestorTier,
        investorsCount: uniqueInvestors,
        contributionsCount: confirmedContributions.length,
        createdAt: d.createdAt,
      };
    });

    // Get total count for pagination
    const total = await prisma.deal.count({ where });

    res.json({
      success: true,
      data: {
        deals: formattedDeals,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: parseInt(offset as string) + formattedDeals.length < total,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'List deals error');
    res.status(500).json({ success: false, error: 'Failed to list deals' });
  }
});

/**
 * GET /deals/open
 * 
 * Get all open deals for investor discovery
 */
router.get('/open', async (req: Request, res: Response) => {
  try {
    const deals = await prisma.deal.findMany({
      where: { status: 'OPEN' },
      include: {
        purchaseOrder: {
          select: {
            poReference: true,
            amount: true,
            buyer: { select: { walletAddress: true } },
          },
        },
        contributions: {
          where: { status: 'CONFIRMED' },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedDeals = deals.map(d => {
      const target = parseFloat(d.targetAmount.toString());
      const funded = parseFloat(d.runningTotal.toString());

      return {
        dealId: d.id,
        atokenSymbol: d.atokenSymbol,
        poReference: d.purchaseOrder.poReference,
        buyerAddress: d.purchaseOrder.buyer.walletAddress,
        targetAmount: target,
        fundedAmount: funded,
        fundedPercent: Math.round((funded / target) * 100),
        remainingCapacity: Math.max(0, target - funded),
        yield: d.yieldPercent,
        fundingDeadline: d.fundingDeadline,
        deliveryDeadline: d.deliveryDeadline,
        eligibleCountries: d.eligibleCountries,
      };
    });

    res.json({
      success: true,
      data: {
        deals: formattedDeals,
        count: formattedDeals.length,
      },
    });
  } catch (error) {
    logger.error({ error }, 'List open deals error');
    res.status(500).json({ success: false, error: 'Failed to list open deals' });
  }
});

/**
 * GET /deals/:dealId
 * 
 * Get detailed deal information
 */
router.get('/:dealId', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: {
          include: {
            buyer: { select: { walletAddress: true, email: true } },
            supplier: { select: { walletAddress: true, email: true } },
            signatures: true,
          },
        },
        contributions: {
          include: {
            investor: { select: { walletAddress: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        repayments: {
          orderBy: { createdAt: 'desc' },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
        },
        investorPayouts: {
          include: {
            investor: { select: { walletAddress: true } },
          },
        },
      },
    });

    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    // Cast to any to avoid Prisma type issues
    const dealAny = deal as any;

    // Calculate totals
    const target = parseFloat(deal.targetAmount.toString());
    const funded = parseFloat(deal.runningTotal.toString());
    const confirmedContributions = deal.contributions.filter(c => c.status === 'CONFIRMED');
    const totalInvestorYield = confirmedContributions.reduce((sum: number, c: any) => {
      return sum + (parseFloat(c.amount) * (deal.yieldPercent / 100));
    }, 0);

    // Format contributions (anonymized for non-participants)
    const contributions = confirmedContributions.map((c: any) => ({
      investorAddress: c.investor.walletAddress,
      amount: parseFloat(c.amount),
      status: c.status,
      createdAt: c.createdAt,
    }));

    // Format investor payouts
    const investorPayoutsFormatted = (dealAny.investorPayouts || []).map((p: any) => ({
      investorAddress: p.investor?.walletAddress,
      principal: parseFloat(p.principal),
      yieldAmount: parseFloat(p.yieldAmount),
      total: parseFloat(p.total),
      status: p.status,
    }));

    // Calculate repayment status
    const repayments = dealAny.repayments || [];
    const totalRepaid = repayments.reduce((sum: number, r: any) => 
      sum + (r.paidAt ? parseFloat(r.amount) : 0), 0
    );
    const expectedRepayment = target * (1 + deal.yieldPercent / 100);
    const repaymentPercent = expectedRepayment > 0 ? Math.round((totalRepaid / expectedRepayment) * 100) : 0;

    const po = dealAny.purchaseOrder || {};

    res.json({
      success: true,
      data: {
        dealId: deal.id,
        poReference: po.poReference,
        poHash: po.id,
        status: deal.status,
        chain: deal.chain,
        targetAmount: target,
        fundedAmount: funded,
        fundedPercent: Math.round((funded / target) * 100),
        remainingCapacity: Math.max(0, target - funded),
        currency: deal.currency,
        yieldPercent: deal.yieldPercent,
        totalInvestorYield,
        atokenSymbol: deal.atokenSymbol,
        atokenAddress: deal.atokenAddress,
        fundingDeadline: deal.fundingDeadline,
        deliveryDeadline: deal.deliveryDeadline,
        eligibleCountries: deal.eligibleCountries as string[],
        minInvestorTier: deal.minInvestorTier,
        walletAddress: deal.circleWalletAddress,
        buyer: {
          address: po.buyer?.walletAddress,
          email: po.buyer?.email,
          signature: (po.signatures || []).find((s: any) => s.signer === 'BUYER')?.signature,
        },
        supplier: {
          address: po.supplier?.walletAddress,
          email: po.supplier?.email,
          signature: (po.signatures || []).find((s: any) => s.signer === 'SUPPLIER')?.signature,
        },
        contributions,
        repayments: {
          totalRepaid,
          expectedRepayment,
          repaymentPercent,
          history: repayments.map((r: any) => ({
            amount: parseFloat(r.amount),
            paidAt: r.paidAt,
          })),
        },
        deliveries: (dealAny.deliveries || []).map((d: any) => ({
          status: d.status,
          buyerSignature: !!d.buyerSignature,
          supplierSignature: !!d.supplierSignature,
          buyerSignedAt: d.buyerSignedAt,
          supplierSignedAt: d.supplierSignedAt,
        })),
        investorPayouts: investorPayoutsFormatted,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      },
    });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId as string }, 'Get deal error');
    res.status(500).json({ success: false, error: 'Failed to get deal' });
  }
});

/**
 * GET /deals/:dealId/timeline
 * 
 * Get deal audit trail / timeline
 */
router.get('/:dealId/timeline', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    // Verify deal exists
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: {
          include: {
            signatures: true,
          },
        },
      },
    });

    if (!deal) {
      return res.status(404).json({ success: false, error: 'Deal not found' });
    }

    const timeline: Array<{
      action: string;
      timestamp: Date;
      actor?: string;
      details: any;
    }> = [];

    // Cast to any to avoid type issues with nested relations
    const dealAny = deal as any;
    const poAny = dealAny.purchaseOrder;

    // Add PO creation
    timeline.push({
      action: 'PO_CREATED',
      timestamp: poAny.createdAt,
      actor: poAny.buyerId,
      details: {
        poId: poAny.id,
        poReference: poAny.poReference,
        amount: poAny.amount,
      },
    });

    // Add PO signatures
    for (const sig of poAny.signatures || []) {
      timeline.push({
        action: `PO_SIGNED_${sig.signer}`,
        timestamp: sig.signedAt,
        actor: sig.signerId,
        details: {
          signature: sig.signature.substring(0, 20) + '...',
        },
      });
    }

    // Add deal creation
    timeline.push({
      action: 'DEAL_CREATED',
      timestamp: deal.createdAt,
      actor: poAny.buyerId,
      details: {
        dealId: deal.id,
        targetAmount: deal.targetAmount.toString(),
        yieldPercent: deal.yieldPercent,
      },
    });

    // Add contributions
    const contributions = await prisma.contribution.findMany({
      where: { dealId: dealId as string },
      orderBy: { createdAt: 'asc' },
    });

    for (const c of contributions) {
      timeline.push({
        action: c.status === 'CONFIRMED' ? 'CONTRIBUTION_RECEIVED' : 'CONTRIBUTION_PENDING',
        timestamp: c.createdAt,
        actor: c.investorId,
        details: {
          contributionId: c.id,
          amount: c.amount,
          type: c.type,
          txHash: c.txHash,
        },
      });

      if (c.confirmedAt) {
        timeline.push({
          action: 'CONTRIBUTION_CONFIRMED',
          timestamp: c.confirmedAt,
          actor: c.investorId,
          details: {
            contributionId: c.id,
          },
        });
      }
    }

    // Add deal status changes
    if (deal.status === 'FUNDED' || deal.status === 'COMPLETED') {
      timeline.push({
        action: 'DEAL_FUNDED',
        timestamp: deal.updatedAt,
        details: {
          fundedAmount: deal.runningTotal.toString(),
        },
      });
    }

    // Add repayments
    const repayments = await prisma.repayment.findMany({
      where: { dealId: dealId as string },
      orderBy: { createdAt: 'asc' },
    });

    for (const r of repayments) {
      timeline.push({
        action: 'REPAYMENT_RECEIVED',
        timestamp: r.createdAt,
        details: {
          repaymentId: r.id,
          amount: r.amount,
          paidAt: r.paidAt,
          txHash: r.txHash,
        },
      });
    }

    // Add investor payouts
    const investorPayouts = await prisma.investorPayout.findMany({
      where: { dealId: dealId as string },
      orderBy: { createdAt: 'asc' },
    });

    for (const p of investorPayouts) {
      timeline.push({
        action: p.status === 'CLAIMED' ? 'INVESTOR_CLAIMED' : 'PAYOUT_READY',
        timestamp: p.updatedAt,
        actor: p.investorId,
        details: {
          payoutId: p.id,
          principal: p.principal,
          yieldAmount: p.yieldAmount,
          total: p.total,
        },
      });
    }

    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    res.json({
      success: true,
      data: {
        dealId,
        atokenSymbol: deal.atokenSymbol,
        timeline,
      },
    });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Get timeline error');
    res.status(500).json({ success: false, error: 'Failed to get timeline' });
  }
});

export default router;
