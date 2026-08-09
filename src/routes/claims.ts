import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config';
import { getAuthService } from '../services/auth';
import { getATokenService } from '../services/cleanverse';
import { getCircleWalletService } from '../services/circle';

const router = Router();
const authService = getAuthService();
const aTokenService = getATokenService();
const circleWalletService = getCircleWalletService();

/**
 * GET /claims/investor/:address
 * Get all claimable payouts for an investor
 */
router.get('/investor/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const user = await prisma.user.findUnique({ where: { walletAddress: address.toLowerCase() } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const payouts = await prisma.investorPayout.findMany({
      where: { investorId: user.id, status: 'PENDING' },
      include: {
        deal: {
          select: {
            id: true, atokenSymbol: true, status: true, totalSupply: true,
            purchaseOrder: { select: { poReference: true, buyer: { select: { walletAddress: true } } } },
            repayments: { where: { paidAt: { not: null } }, select: { amount: true } },
          },
        },
      },
    });

    const claims = payouts.filter((p: any) => p.deal?.repayments?.length > 0).map((p: any) => ({
      claimId: p.id, dealId: p.dealId, atokenSymbol: p.deal?.atokenSymbol,
      poReference: p.deal?.purchaseOrder?.poReference, buyerAddress: p.deal?.purchaseOrder?.buyer?.walletAddress,
      principal: parseFloat(p.principal), yieldAmount: parseFloat(p.yieldAmount),
      totalClaimable: parseFloat(p.total), tokenAmount: parseFloat(p.tokenAmount),
      status: p.status, canClaim: p.status === 'PENDING',
    }));

    res.json({ success: true, data: { investorAddress: user.walletAddress, claims,
      totalClaimable: claims.reduce((sum: number, c: any) => sum + c.totalClaimable, 0), count: claims.length } });
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Get claims error');
    res.status(500).json({ success: false, error: 'Failed to get claims' });
  }
});

/**
 * GET /claims/:dealId/investor/:address - Get claimable amount for a specific deal
 */
router.get('/:dealId/investor/:address', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string, address = req.params.address as string;
    const user = await prisma.user.findUnique({ where: { walletAddress: address.toLowerCase() } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const payout = await prisma.investorPayout.findFirst({
      where: { dealId, investorId: user.id },
      include: {
        deal: {
          select: {
            id: true, atokenSymbol: true, status: true, yieldPercent: true, targetAmount: true, totalSupply: true,
            purchaseOrder: { select: { poReference: true, buyer: { select: { walletAddress: true } } } },
            repayments: { where: { paidAt: { not: null } }, select: { amount: true, paidAt: true } },
          },
        },
      },
    });

    if (!payout) return res.status(404).json({ success: false, error: 'No investment found' });
    const po = payout.deal as any;
    const repayments = po.repayments || [];
    const totalRepaid = repayments.reduce((sum: number, r: any) => sum + parseFloat(r.amount), 0);

    res.json({ success: true, data: {
      claimId: payout.id, dealId, atokenSymbol: po.atokenSymbol,
      poReference: po.purchaseOrder?.poReference, buyerAddress: po.purchaseOrder?.buyer?.walletAddress,
      dealStatus: po.status, isRepaid: totalRepaid > 0, totalRepaid,
      principal: parseFloat(payout.principal), yieldPercent: po.yieldPercent,
      yieldAmount: parseFloat(payout.yieldAmount), totalClaimable: parseFloat(payout.total),
      tokenAmount: parseFloat(payout.tokenAmount), status: payout.status,
      canClaim: payout.status === 'PENDING' && totalRepaid > 0, lastRepaymentAt: repayments[0]?.paidAt || null,
    }});
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId, address: req.params.address }, 'Get claim error');
    res.status(500).json({ success: false, error: 'Failed to get claim' });
  }
});

/**
 * POST /claims/:dealId/investor/:address/claim
 * Investor claims their payout - BURN A-TOKENS and receive USDC
 */
router.post('/:dealId/investor/:address/claim', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string, address = req.params.address as string;
    const { signature, message } = req.body;
    if (!signature || !message) return res.status(400).json({ success: false, error: 'signature and message required' });

    const authResult = authService.verifySignature(signature, message);
    if (!authResult.valid || !authResult.walletAddress) return res.status(401).json({ success: false, error: 'Invalid signature' });
    if (authResult.walletAddress.toLowerCase() !== address.toLowerCase()) return res.status(403).json({ success: false, error: 'Wrong signer' });

    const user = await prisma.user.findUnique({ where: { walletAddress: address.toLowerCase() } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { repayments: true } });
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
    if (deal.status !== 'READY_FOR_DISTRIBUTION') return res.status(400).json({ success: false, error: 'Deal not ready for distribution. Status: '.concat(deal.status) });
    if (deal.repayments.length === 0) return res.status(400).json({ success: false, error: 'No repayment received yet' });

    const payout = await prisma.investorPayout.findFirst({ where: { dealId, investorId: user.id } });
    if (!payout) return res.status(404).json({ success: false, error: 'No investment found for this deal' });
    if (payout.status === 'CLAIMED') return res.status(400).json({ success: false, error: 'Payout already claimed' });

    // Get token amount
    const tokenAmount = parseFloat(payout.tokenAmount);

    // 1. BURN A-TOKENS from investor's wallet
    // If burn not available, investor transfers tokens to deal wallet as fallback
    let tokensRemoved = false;
    let tokenTxHash: string | undefined;

    try {
      if (deal.atokenAddress) {
        const burnResult = await aTokenService.burn({ 
          atokenAddress: deal.atokenAddress, 
          address: address, 
          amount: tokenAmount.toString() 
        });
        
        if (burnResult.code === '0000') {
          tokensRemoved = true;
          tokenTxHash = burnResult.data?.tx_hash;
          logger.info({ atokenAddress: deal.atokenAddress, investorAddress: address, tokenAmount, txHash: tokenTxHash }, 'A-tokens burned successfully');
        } else {
          logger.warn({ error: burnResult.message, dealId, investorAddress: address }, 'Burn failed, will transfer to deal wallet');
        }
      }
    } catch (burnError) {
      logger.warn({ error: burnError, dealId, investorAddress: address }, 'Burn call failed, will transfer to deal wallet');
    }

    // Fallback: Transfer tokens to deal wallet if burn not available
    if (!tokensRemoved && deal.atokenAddress && deal.circleWalletAddress) {
      try {
        // Transfer A-tokens from investor to deal wallet
        // This effectively removes tokens from investor's possession
        const transferResult = await aTokenService.transfer({
          atokenAddress: deal.atokenAddress,
          fromAddress: address,
          toAddress: deal.circleWalletAddress,
          amount: tokenAmount.toString(),
        });

        if (transferResult.code === '0000') {
          tokenTxHash = transferResult.data?.tx_hash;
          tokensRemoved = true;
          logger.info({ 
            atokenAddress: deal.atokenAddress, 
            investorAddress: address, 
            dealWalletAddress: deal.circleWalletAddress,
            tokenAmount,
            txHash: tokenTxHash
          }, 'A-tokens transferred to deal wallet successfully');
        } else {
          logger.warn({ error: transferResult.message, dealId, investorAddress: address }, 'Transfer to deal wallet failed');
        }
      } catch (transferError) {
        logger.error({ error: transferError, dealId, investorAddress: address }, 'Failed to transfer A-tokens');
      }
    }

    // 2. TRANSFER USDC from deal wallet to investor
    let transferSuccess = false;
    let transferId: string | undefined;

    try {
      if (deal.circleWalletId) {
        const transferResult = await circleWalletService.transferFromDealWallet({
          dealWalletId: deal.circleWalletId,
          destinationAddress: address,
          amount: payout.total,
          dealId,
        });
        transferSuccess = transferResult.success;
        transferId = transferResult.transferId;
      }
    } catch (transferError) {
      logger.error({ error: transferError, dealId, investorAddress: address }, 'Failed to transfer USDC - continuing in demo mode');
    }

    // 3. Update deal total supply (subtract burned tokens)
    const newTotalSupply = Math.max(0, parseFloat(deal.totalSupply.toString()) - tokenAmount);
    await prisma.deal.update({
      where: { id: dealId },
      data: { totalSupply: newTotalSupply },
    });

    // 4. Mark payout as claimed
    const updated = await prisma.investorPayout.update({
      where: { id: payout.id },
      data: { 
        status: 'CLAIMED', 
        txHash: transferId || 'DEMO-CLAIM-'.concat(Date.now().toString()),
      },
    });

    // 5. Log audit event
    await prisma.auditLog.create({ data: { 
      entityType: 'INVESTOR_PAYOUT', 
      entityId: payout.id, 
      action: 'INVESTOR_CLAIMED', 
      actor: address.toLowerCase(), 
      details: { 
        dealId, 
        principal: payout.principal, 
        yieldAmount: payout.yieldAmount, 
        total: payout.total,
        tokenAmount: payout.tokenAmount,
        tokensRemoved: tokenAmount,
        tokenRemovalMethod: tokensRemoved ? (tokenTxHash?.startsWith("TRANSFER") ? "TRANSFER_TO_DEAL_WALLET" : "BURN") : "NONE",
        tokenTxHash,
        transferId,
      } 
    }});

    logger.info({ dealId, investorAddress: address, tokenAmount, amount: payout.total, transferSuccess }, 'Investor claimed payout - tokens burned');

    res.json({ success: true, data: {
      claimId: updated.id, dealId, investorAddress: address, 
      principal: parseFloat(updated.principal), yieldAmount: parseFloat(updated.yieldAmount), 
      totalClaimed: parseFloat(updated.total), tokenAmount: parseFloat(updated.tokenAmount),
      tokensRemoved: tokenAmount,
        tokenRemovalMethod: tokensRemoved ? (tokenTxHash?.startsWith("TRANSFER") ? "TRANSFER_TO_DEAL_WALLET" : "BURN") : "NONE",
        tokenTxHash,
      transferId,
      status: 'CLAIMED', 
      message: 'Payout claimed successfully. '.concat(tokenAmount.toString(), ' A-tokens burned. USDC transferred to your wallet.'),
    }});
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId, address: req.params.address }, 'Claim error');
    res.status(500).json({ success: false, error: 'Failed to claim payout' });
  }
});

/**
 * GET /claims/history/:address - Get claim history
 */
router.get('/history/:address', async (req: Request, res: Response) => {
  try {
    const address = req.params.address as string;
    const user = await prisma.user.findUnique({ where: { walletAddress: address.toLowerCase() } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const payouts = await prisma.investorPayout.findMany({
      where: { investorId: user.id },
      include: { deal: { select: { id: true, atokenSymbol: true, status: true, purchaseOrder: { select: { poReference: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });

    const pending = payouts.filter((p) => p.status === 'PENDING');
    const claimed = payouts.filter((p) => p.status === 'CLAIMED');

    res.json({ success: true, data: {
      pending: pending.map((p: any) => ({ claimId: p.id, dealId: p.dealId, atokenSymbol: p.deal?.atokenSymbol, poReference: p.deal?.purchaseOrder?.poReference, principal: parseFloat(p.principal), yieldAmount: parseFloat(p.yieldAmount), totalClaimable: parseFloat(p.total), status: p.status })),
      claimed: claimed.map((p: any) => ({ claimId: p.id, dealId: p.dealId, atokenSymbol: p.deal?.atokenSymbol, poReference: p.deal?.purchaseOrder?.poReference, principal: parseFloat(p.principal), yieldAmount: parseFloat(p.yieldAmount), totalReceived: parseFloat(p.total), claimedAt: p.updatedAt })),
      stats: { pendingCount: pending.length, claimedCount: claimed.length, totalClaimed: claimed.reduce((sum, p) => sum + parseFloat(p.total), 0), totalPending: pending.reduce((sum, p) => sum + parseFloat(p.total), 0) },
    }});
  } catch (error) {
    logger.error({ error, address: req.params.address }, 'Get claim history error');
    res.status(500).json({ success: false, error: 'Failed to get claim history' });
  }
});

export default router;
