import { Router, Request, Response } from 'express';
import { getSettlementService } from '../services/settlement/settlement.service';
import { getAuthService } from '../services/auth';
import { getSettlementService as getSettlementSvc } from '../services/settlement/settlement.service';
import { payoutReleaseRequestSchema } from '../services/auth/schemas';
import { logger } from '../config';
import { prisma } from '../config/database';

const router = Router();
const settlementService = getSettlementService();

/**
 * GET /settlement/deals/:dealId/status
 * 
 * Get settlement status for a deal
 */
router.get('/deals/:dealId/status', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    const summary = await settlementService.getSettlementSummary(dealId);

    res.json({ success: true, settlement: summary });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Get settlement status error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/can-settle
 * 
 * Check if deal can initiate settlement
 */
router.post('/deals/:dealId/can-settle', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    const result = await settlementService.canInitiateSettlement(dealId);

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Check settlement error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/pay-supplier
 * 
 * Initiate supplier payment from Circle wallet
 */
router.post('/deals/:dealId/pay-supplier', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const { operatorAddress } = req.body;

    if (!operatorAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'operatorAddress is required' 
      });
    }

    logger.info({ dealId, operatorAddress }, 'Pay supplier request');

    const result = await settlementService.initiateSettlement({
      dealId,
      operatorAddress,
    });

    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Supplier payment initiated',
        transferId: result.transferId 
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Pay supplier error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/payout-release
 * 
 * Release payout to supplier with dual signatures:
 * - Admin EIP-712 signature: Platform approves payout
 * - Supplier EIP-712 signature: Supplier signs PO for payment
 */
router.post('/deals/:dealId/payout-release', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    
    // Validate request schema
    const validated = payoutReleaseRequestSchema.parse({
      ...req.body,
      dealId,
    });
    
    const authService = getAuthService();

    // 1. Verify ADMIN signature and recover admin address
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

    // 2. Verify SUPPLIER signature and recover supplier address
    const supplierAuthResult = authService.verifySignature(
      validated.supplierSignature,
      validated.supplierMessage
    );
    
    if (!supplierAuthResult.valid || !supplierAuthResult.walletAddress) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid supplier signature', details: supplierAuthResult.error },
      });
    }

    logger.info({ 
      adminAddress: adminAuthResult.walletAddress,
      supplierAddress: supplierAuthResult.walletAddress,
      dealId,
      amount: validated.amount,
      poId: validated.poId
    }, 'Processing payout release with dual signatures');

    // 3. Verify the PO belongs to this deal and get supplier address
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: {
          include: { supplier: true }
        }
      },
    });

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { message: 'Deal not found' },
      });
    }

    if (deal.purchaseOrderId !== validated.poId) {
      return res.status(400).json({
        success: false,
        error: { message: 'PO ID does not match deal' },
      });
    }

    // 4. Verify supplier address matches
    const expectedSupplierAddress = deal.purchaseOrder.supplier.walletAddress.toLowerCase();
    const actualSupplierAddress = supplierAuthResult.walletAddress.toLowerCase();
    
    if (expectedSupplierAddress !== actualSupplierAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'Supplier address mismatch' },
      });
    }

    // 5. Check deal is fully funded
    const runningTotal = parseFloat(deal.runningTotal.toString());
    const targetAmount = parseFloat(deal.targetAmount.toString());
    
    if (runningTotal < targetAmount) {
      return res.status(400).json({
        success: false,
        error: { message: 'Deal not fully funded' },
      });
    }

    // 6. Initiate settlement (pay supplier)
    logger.info({ dealId, supplierAddress: supplierAuthResult.walletAddress }, 'Initiating supplier payout');

    const result = await settlementService.initiateSettlement({
      dealId,
      operatorAddress: adminAuthResult.walletAddress,
    });

    if (result.success) {
      logger.info({ 
        dealId, 
        transferId: result.transferId,
        adminAddress: adminAuthResult.walletAddress,
        supplierAddress: supplierAuthResult.walletAddress
      }, 'Payout release successful');
      
      res.json({
        success: true,
        data: {
          dealId,
          transferId: result.transferId,
          supplierAddress: supplierAuthResult.walletAddress,
          adminAddress: adminAuthResult.walletAddress,
          amount: validated.amount,
          poId: validated.poId,
          status: 'SUPPLIER_PAID',
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: { message: 'Payout release failed', details: result.error },
      });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Payout release error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/confirm-delivery
 * 
 * Confirm delivery by buyer or supplier
 */
router.post('/deals/:dealId/confirm-delivery', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const { confirmerAddress, confirmerType, notes } = req.body;

    if (!confirmerAddress || !confirmerType) {
      return res.status(400).json({ 
        success: false, 
        error: 'confirmerAddress and confirmerType are required' 
      });
    }

    if (!['BUYER', 'SUPPLIER'].includes(confirmerType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'confirmerType must be BUYER or SUPPLIER' 
      });
    }

    logger.info({ dealId, confirmerType, confirmerAddress }, 'Confirm delivery request');

    const result = await settlementService.confirmDelivery({
      dealId,
      confirmerAddress,
      confirmerType,
      notes,
    });

    if (result.success) {
      res.json({ 
        success: true, 
        message: result.deliveryConfirmed 
          ? 'Delivery fully confirmed'
          : 'Delivery confirmed by one party',
        deliveryConfirmed: result.deliveryConfirmed 
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Confirm delivery error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/buyer-confirm-delivery
 * 
 * Buyer confirms receipt of goods with EIP-712 signature.
 * This triggers the repayment phase where buyer pays back principal + yield.
 */
router.post('/deals/:dealId/buyer-confirm-delivery', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const { signature, message, notes } = req.body;

    if (!signature || !message) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'signature and message are required' }
      });
    }

    // Verify buyer signature
    const authService = getAuthService();
    const authResult = authService.verifySignature(signature, message);
    
    if (!authResult.valid || !authResult.walletAddress) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid buyer signature', details: authResult.error },
      });
    }

    // Verify the buyer is the PO buyer
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { purchaseOrder: { include: { buyer: true } } },
    });

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { message: 'Deal not found' },
      });
    }

    const buyerAddress = deal.purchaseOrder.buyer.walletAddress.toLowerCase();
    if (authResult.walletAddress.toLowerCase() !== buyerAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the PO buyer can confirm delivery' },
      });
    }

    // Check deal status - must be in delivery phase
    if (!['CLOSED_FUNDED', 'AWAITING_DELIVERY', 'AWAITING_REPAYMENT'].includes(deal.status)) {
      return res.status(400).json({
        success: false,
        error: { message: `Deal must be funded. Current status: ${deal.status}` },
      });
    }

    logger.info({ dealId, buyerAddress: authResult.walletAddress }, 'Buyer confirming delivery');

    const result = await settlementService.confirmDelivery({
      dealId,
      confirmerAddress: authResult.walletAddress,
      confirmerType: 'BUYER',
      notes,
    });

    if (result.success) {
      // Update deal status to awaiting repayment
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: 'AWAITING_REPAYMENT' },
      });

      res.json({ 
        success: true, 
        data: {
          dealId,
          deliveryConfirmed: result.deliveryConfirmed,
          buyerConfirmed: true,
          buyerAddress: authResult.walletAddress,
          status: 'AWAITING_REPAYMENT',
          message: result.deliveryConfirmed 
            ? 'Delivery fully confirmed. Repayment phase now active.'
            : 'Delivery confirmed by buyer. Awaiting supplier confirmation.',
        },
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Buyer confirm delivery error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/repay
 * 
 * Record repayment from buyer
 */
router.post('/deals/:dealId/repay', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const { amount, txHash, fromAddress } = req.body;

    if (!amount || !fromAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'amount and fromAddress are required' 
      });
    }

    logger.info({ dealId, amount }, 'Repayment request');

    const result = await settlementService.recordRepayment({
      dealId,
      amount,
      txHash,
      fromAddress,
    });

    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Repayment recorded',
        repaymentId: result.repaymentId,
        totalReceived: result.totalReceived
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Repayment error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/buyer-repay
 * 
 * Buyer pays back principal + yield with EIP-712 signature.
 * Calculates: targetAmount * (1 + yieldPercent/100)
 */
router.post('/deals/:dealId/buyer-repay', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const { signature, message, txHash } = req.body;

    if (!signature || !message) {
      return res.status(400).json({ 
        success: false, 
        error: { message: 'signature and message are required' }
      });
    }

    // Verify buyer signature
    const authService = getAuthService();
    const authResult = authService.verifySignature(signature, message);
    
    if (!authResult.valid || !authResult.walletAddress) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid buyer signature', details: authResult.error },
      });
    }

    // Verify the buyer is the PO buyer
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { 
        purchaseOrder: { include: { buyer: true } },
        repayments: true,
      },
    });

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: { message: 'Deal not found' },
      });
    }

    const buyerAddress = deal.purchaseOrder.buyer.walletAddress.toLowerCase();
    if (authResult.walletAddress.toLowerCase() !== buyerAddress) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only the PO buyer can make repayment' },
      });
    }

    // Calculate repayment amount: principal + yield
    const principal = parseFloat(deal.targetAmount.toString());
    const yieldAmount = principal * (deal.yieldPercent / 100);
    const totalRepayment = principal + yieldAmount;
    
    // Check what's already been repaid
    const alreadyRepaid = deal.repayments
      .filter(r => r.paidAt)
      .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);
    
    const remaining = totalRepayment - alreadyRepaid;

    logger.info({ 
      dealId, 
      buyerAddress: authResult.walletAddress,
      principal,
      yieldAmount,
      totalRepayment,
      alreadyRepaid,
      remaining
    }, 'Buyer repayment request');

    const result = await settlementService.recordRepayment({
      dealId,
      amount: remaining.toString(),
      txHash: txHash || `DEMO-REPAY-${Date.now()}`,
      fromAddress: authResult.walletAddress,
    });

    if (result.success) {
      res.json({ 
        success: true, 
        data: {
          dealId,
          buyerAddress: authResult.walletAddress,
          principal,
          yieldPercent: deal.yieldPercent,
          yieldAmount: yieldAmount.toString(),
          totalRepayment: totalRepayment.toString(),
          repaidAmount: remaining.toString(),
          totalReceived: result.totalReceived,
          fullyRepaid: result.fullyRepaid,
          status: result.fullyRepaid ? 'READY_FOR_DISTRIBUTION' : 'PARTIAL_REPAYMENT',
        },
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Buyer repay error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * POST /settlement/deals/:dealId/distribute
 * 
 * Calculate and distribute payouts to investors
 */
router.post('/deals/:dealId/distribute', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    logger.info({ dealId }, 'Distribute payouts request');

    const result = await settlementService.calculateAndDistributePayouts(dealId);

    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Payouts calculated and distributed',
        payouts: result.payouts
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Distribute error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * GET /settlement/deals/:dealId/payouts
 * 
 * Get investor payouts for a deal
 */
router.get('/deals/:dealId/payouts', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;

    const payouts = await settlementService.getInvestorPayouts(dealId);

    res.json({ success: true, payouts });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Get payouts error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

/**
 * GET /settlement/deals/:dealId/events
 * 
 * Get settlement events for a deal
 */
router.get('/deals/:dealId/events', async (req: Request, res: Response) => {
  try {
    const dealId = req.params.dealId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    const events = await settlementService.getSettlementEvents(dealId, limit);

    res.json({ success: true, events });
  } catch (error) {
    logger.error({ error, dealId: req.params.dealId }, 'Get events error');
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed' 
    });
  }
});

export default router;
