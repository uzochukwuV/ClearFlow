import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config';

const router = Router();

/**
 * GET /dashboard/buyer/:address
 * 
 * Buyer dashboard with all their POs and deals
 */
router.get('/buyer/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get user
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get purchase orders as buyer
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { buyerId: user.id },
      include: {
        supplier: { select: { walletAddress: true, email: true } },
        signatures: true,
        deal: {
          select: {
            id: true,
            status: true,
            targetAmount: true,
            runningTotal: true,
            yieldPercent: true,
            deliveryDeadline: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get all deals for these POs
    const dealIds = purchaseOrders
      .filter(po => po.deal)
      .map(po => po.deal!.id);

    const deals = await prisma.deal.findMany({
      where: { id: { in: dealIds } },
      include: {
        contributions: {
          select: {
            id: true,
            amount: true,
            status: true,
            investor: { select: { walletAddress: true } },
          },
        },
        repayments: true,
      },
    });

    const dealsMap = new Map(deals.map(d => [d.id, d]));

    // Calculate stats
    const activePOs = purchaseOrders.filter(po => 
      po.status !== 'SIGNED' && po.status !== 'CANCELLED'
    ).length;
    
    const activeDeals = deals.filter(d => 
      ['OPEN', 'FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT'].includes(d.status)
    ).length;

    const totalVolume = deals.reduce((sum, d) => 
      sum + parseFloat(d.targetAmount.toString()), 0
    );

    // Format response
    const formattedPOs = purchaseOrders.map(po => ({
      poId: po.id,
      poReference: po.poReference,
      supplierAddress: po.supplier.walletAddress,
      supplierEmail: po.supplier.email,
      amount: po.amount,
      currency: po.currency,
      status: po.status,
      createdAt: po.createdAt,
      deal: po.deal ? {
        dealId: po.deal.id,
        targetAmount: po.deal.targetAmount,
        fundedAmount: po.deal.runningTotal,
        fundedPercent: Math.round(
          (parseFloat(po.deal.runningTotal.toString()) / parseFloat(po.deal.targetAmount.toString())) * 100
        ),
        status: dealsMap.get(po.deal.id)?.status || po.deal.status,
        yield: po.deal.yieldPercent,
        deliveryDeadline: po.deal.deliveryDeadline,
      } : null,
      signatures: po.signatures.map(s => ({
        signer: s.signer,
        signedAt: s.signedAt,
      })),
    }));

    res.json({
      success: true,
      data: {
        user: {
          address: user.walletAddress,
          email: user.email,
        },
        purchaseOrders: formattedPOs,
        stats: {
          activePOs,
          activeDeals,
          totalVolume,
        },
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Buyer dashboard error');
    res.status(500).json({ success: false, error: 'Failed to get dashboard' });
  }
});

/**
 * GET /dashboard/supplier/:address
 * 
 * Supplier dashboard with pending POs and payouts
 */
router.get('/supplier/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get user
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get purchase orders as supplier
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { supplierId: user.id },
      include: {
        buyer: { select: { walletAddress: true, email: true } },
        signatures: true,
        deal: {
          select: {
            id: true,
            status: true,
            targetAmount: true,
            circleWalletAddress: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get pending payouts
    const pendingPayoutDeals = await prisma.deal.findMany({
      where: {
        purchaseOrder: { supplierId: user.id },
        status: 'FUNDED',
      },
      select: {
        id: true,
        targetAmount: true,
        purchaseOrder: {
          select: {
            poReference: true,
            deliveryDate: true,
          },
        },
      },
    });

    // Get completed payouts
    const completedPayouts = await prisma.auditLog.findMany({
      where: {
        entityType: 'DEAL',
        action: 'SUPPLIER_PAYMENT',
        actor: user.walletAddress.toLowerCase(),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Stats
    const pendingSignatures = purchaseOrders.filter(po => 
      po.status === 'PENDING_SUPPLIER_SIGNATURE'
    ).length;

    const pendingPayouts = pendingPayoutDeals.length;
    const completedDeals = purchaseOrders.filter(po => po.status === 'SIGNED').length;

    // Format POs
    const formattedPOs = purchaseOrders.map(po => {
      const buyerSig = po.signatures.find(s => s.signer === 'BUYER');
      const supplierSig = po.signatures.find(s => s.signer === 'SUPPLIER');
      
      return {
        poId: po.id,
        poReference: po.poReference,
        buyerAddress: po.buyer.walletAddress,
        buyerEmail: po.buyer.email,
        amount: po.amount,
        status: po.status,
        createdAt: po.createdAt,
        needsAction: po.status === 'PENDING_SUPPLIER_SIGNATURE',
        buyerSigned: !!buyerSig,
        buyerSignedAt: buyerSig?.signedAt,
        supplierSigned: !!supplierSig,
        supplierSignedAt: supplierSig?.signedAt,
        deal: po.deal,
      };
    });

    res.json({
      success: true,
      data: {
        user: {
          address: user.walletAddress,
          email: user.email,
        },
        purchaseOrders: formattedPOs,
        pendingPayouts: pendingPayoutDeals.map(d => ({
          dealId: d.id,
          poReference: d.purchaseOrder.poReference,
          amount: d.targetAmount,
          deliveryDate: d.purchaseOrder.deliveryDate,
        })),
        completedPayouts: completedPayouts.map(p => ({
          action: p.action,
          details: p.details,
          timestamp: p.createdAt,
        })),
        stats: {
          pendingSignatures,
          pendingPayouts,
          completedDeals,
        },
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Supplier dashboard error');
    res.status(500).json({ success: false, error: 'Failed to get dashboard' });
  }
});

/**
 * GET /dashboard/investor/:address
 * 
 * Investor dashboard with portfolio, contributions, and claims
 */
router.get('/investor/:address', async (req: Request, res: Response) => {
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
            targetAmount: true,
            runningTotal: true,
            yieldPercent: true,
            status: true,
            deliveryDeadline: true,
            atokenSymbol: true,
            purchaseOrder: {
              select: { poReference: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get investor payouts (claims)
    const investorPayouts = await prisma.investorPayout.findMany({
      where: { investorId: user.id },
      include: {
        deal: {
          select: {
            id: true,
            atokenSymbol: true,
            status: true,
            purchaseOrder: { select: { poReference: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate portfolio stats
    const totalInvested = contributions
      .filter(c => c.status === 'CONFIRMED')
      .reduce((sum, c) => sum + parseFloat(c.amount), 0);

    const activeDeals = new Set(
      contributions
        .filter(c => ['OPEN', 'FUNDED', 'AWAITING_DELIVERY', 'DELIVERED', 'AWAITING_REPAYMENT']
          .includes(c.deal.status))
        .map(c => c.dealId)
    ).size;

    // Get open deals for discovery
    const openDeals = await prisma.deal.findMany({
      where: { status: 'OPEN' },
      include: {
        purchaseOrder: {
          select: {
            buyer: { select: { walletAddress: true } },
            poReference: true,
          },
        },
        contributions: {
          select: { amount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Format available deals
    const availableDeals = openDeals.map(d => {
      const funded = parseFloat(d.runningTotal.toString());
      const target = parseFloat(d.targetAmount.toString());
      return {
        dealId: d.id,
        atokenSymbol: d.atokenSymbol,
        poReference: d.purchaseOrder.poReference,
        buyerAddress: d.purchaseOrder.buyer.walletAddress,
        targetAmount: target,
        fundedAmount: funded,
        fundedPercent: Math.round((funded / target) * 100),
        remainingCapacity: target - funded,
        yield: d.yieldPercent,
        fundingDeadline: d.fundingDeadline,
        deliveryDeadline: d.deliveryDeadline,
        eligibleCountries: d.eligibleCountries,
      };
    });

    // Format contributions
    const formattedContributions = contributions.map(c => {
      const totalYield = parseFloat(c.amount) * (c.deal.yieldPercent / 100);
      return {
        contributionId: c.id,
        dealId: c.dealId,
        atokenSymbol: c.deal.atokenSymbol,
        poReference: c.deal.purchaseOrder.poReference,
        amount: parseFloat(c.amount),
        tokenAmount: parseFloat(c.amount), // In demo, 1:1
        status: c.status,
        yieldEarned: totalYield,
        expectedReturn: parseFloat(c.amount) + totalYield,
        dealStatus: c.deal.status,
        createdAt: c.createdAt,
      };
    });

    // Format pending claims
    const pendingClaims = investorPayouts
      .filter(p => p.status === 'PENDING')
      .map(p => ({
        dealId: p.dealId,
        atokenSymbol: p.deal.atokenSymbol,
        poReference: p.deal.purchaseOrder.poReference,
        principal: parseFloat(p.principal),
        yieldAmount: parseFloat(p.yieldAmount),
        totalClaimable: parseFloat(p.total),
        status: p.status,
      }));

    // Format completed claims
    const completedClaims = investorPayouts
      .filter(p => p.status === 'CLAIMED')
      .map(p => ({
        dealId: p.dealId,
        atokenSymbol: p.deal.atokenSymbol,
        principal: parseFloat(p.principal),
        yieldAmount: parseFloat(p.yieldAmount),
        totalReceived: parseFloat(p.total),
        claimedAt: p.updatedAt,
      }));

    res.json({
      success: true,
      data: {
        user: {
          address: user.walletAddress,
          email: user.email,
        },
        portfolio: {
          totalInvested,
          activeDeals,
          totalYieldEarned: completedClaims.reduce((sum, c) => sum + c.yieldAmount, 0),
          pendingYield: pendingClaims.reduce((sum, c) => sum + c.yieldAmount, 0),
        },
        availableDeals,
        contributions: formattedContributions,
        pendingClaims,
        completedClaims,
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Investor dashboard error');
    res.status(500).json({ success: false, error: 'Failed to get dashboard' });
  }
});

/**
 * GET /dashboard/admin/:address
 * 
 * Admin dashboard with all deals and pending actions
 */
router.get('/admin/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;

    // Get user
    const user = await prisma.user.findUnique({
      where: { walletAddress: address.toLowerCase() },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get all deals
    const deals = await prisma.deal.findMany({
      include: {
        purchaseOrder: {
          select: {
            poReference: true,
            buyer: { select: { walletAddress: true, email: true } },
            supplier: { select: { walletAddress: true, email: true } },
          },
        },
        contributions: {
          select: { amount: true, status: true },
        },
        repayments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Stats
    const totalDeals = deals.length;
    const openDeals = deals.filter(d => d.status === 'OPEN').length;
    const fundedDeals = deals.filter(d => d.status === 'FUNDED').length;
    const completedDeals = deals.filter(d => d.status === 'COMPLETED').length;
    const totalVolume = deals.reduce((sum, d) => 
      sum + parseFloat(d.targetAmount.toString()), 0
    );

    // Pending supplier payouts
    const pendingPayouts = deals.filter(d => d.status === 'FUNDED');

    // Awaiting repayment
    const awaitingRepayment = deals.filter(d => d.status === 'AWAITING_REPAYMENT');

    // Ready for distribution
    const readyForDistribution = deals.filter(d => d.status === 'READY_FOR_DISTRIBUTION');

    res.json({
      success: true,
      data: {
        user: {
          address: user.walletAddress,
        },
        deals: deals.map(d => ({
          dealId: d.id,
          poReference: d.purchaseOrder.poReference,
          buyerAddress: d.purchaseOrder.buyer.walletAddress,
          supplierAddress: d.purchaseOrder.supplier.walletAddress,
          targetAmount: parseFloat(d.targetAmount.toString()),
          fundedAmount: parseFloat(d.runningTotal.toString()),
          fundedPercent: Math.round(
            (parseFloat(d.runningTotal.toString()) / parseFloat(d.targetAmount.toString())) * 100
          ),
          status: d.status,
          yield: d.yieldPercent,
          fundingDeadline: d.fundingDeadline,
          deliveryDeadline: d.deliveryDeadline,
          contributions: d.contributions.length,
        })),
        pendingPayouts: pendingPayouts.map(d => ({
          dealId: d.id,
          poReference: d.purchaseOrder.poReference,
          supplierAddress: d.purchaseOrder.supplier.walletAddress,
          amount: parseFloat(d.targetAmount.toString()),
        })),
        awaitingRepayment: awaitingRepayment.map(d => ({
          dealId: d.id,
          poReference: d.purchaseOrder.poReference,
          buyerAddress: d.purchaseOrder.buyer.walletAddress,
          amount: parseFloat(d.targetAmount.toString()),
        })),
        readyForDistribution: readyForDistribution.map(d => ({
          dealId: d.id,
          poReference: d.purchaseOrder.poReference,
        })),
        stats: {
          totalDeals,
          openDeals,
          fundedDeals,
          completedDeals,
          totalVolume,
          pendingPayouts: pendingPayouts.length,
          awaitingRepayment: awaitingRepayment.length,
          readyForDistribution: readyForDistribution.length,
        },
      },
    });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Admin dashboard error');
    res.status(500).json({ success: false, error: 'Failed to get dashboard' });
  }
});

export default router;
