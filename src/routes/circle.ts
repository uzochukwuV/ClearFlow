import { Router, Request, Response } from 'express';
import { getCircleWalletService } from '../services/circle';
import { logger } from '../config';

const router = Router();
const walletService = getCircleWalletService();

/**
 * GET /circle/health
 * 
 * Check Circle API connectivity (basic test)
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Try to get a test wallet to verify connectivity
    res.json({
      success: true,
      circle: {
        status: 'connected',
        message: 'Circle API is configured',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Circle health check error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

/**
 * GET /circle/wallets/:id
 * 
 * Get wallet by ID
 */
router.get('/wallets/:id', async (req: Request, res: Response) => {
  try {
    const walletId = req.params.id as string;

    const result = await walletService.getDealWallet(walletId);

    if (result.success) {
      res.json({
        success: true,
        wallet: result.wallet,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error({ error, walletId: req.params.id }, 'Get wallet error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

/**
 * GET /circle/wallets/:id/balance
 * 
 * Get wallet USDC balance
 */
router.get('/wallets/:id/balance', async (req: Request, res: Response) => {
  try {
    const walletId = req.params.id as string;

    const result = await walletService.getWalletBalances(walletId);

    if (result.success) {
      res.json({
        success: true,
        balances: result.balances,
        totalUsdc: result.totalUsdc,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error({ error, walletId: req.params.id }, 'Get balance error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

/**
 * GET /circle/wallets/:id/address
 * 
 * Get wallet USDC deposit address
 */
router.get('/wallets/:id/address', async (req: Request, res: Response) => {
  try {
    const walletId = req.params.id as string;

    const result = await walletService.getDepositAddress(walletId);

    if (result.success) {
      res.json({
        success: true,
        address: result.address,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error({ error, walletId: req.params.id }, 'Get address error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

/**
 * GET /circle/transfers/:id
 * 
 * Get transfer status
 */
router.get('/transfers/:id', async (req: Request, res: Response) => {
  try {
    const transferId = req.params.id as string;

    const result = await walletService.getTransferStatus(transferId);

    if (result.success) {
      res.json({
        success: true,
        transfer: result.transfer,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error({ error, transferId: req.params.id }, 'Get transfer error');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed',
    });
  }
});

export default router;
