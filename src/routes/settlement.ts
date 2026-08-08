import { Router, Request, Response } from 'express';
import { getSettlementService } from '../services/settlement/settlement.service';
import { logger } from '../config';

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
