import { Router, Request, Response } from 'express';
import { getRampService } from '../services/cleanverse/ramp.service';
import { logger } from '../config';

const router = Router();
const rampService = getRampService();

/**
 * GET /ramp/currencies
 * 
 * Get supported fiat currencies for on-ramp
 */
router.get('/currencies', async (req: Request, res: Response) => {
  try {
    const result = await rampService.getFiatCurrencies();

    res.json({ 
      success: true, 
      currencies: Array.isArray(result.data) ? result.data : []
    });
  } catch (error) {
    logger.error({ error }, 'Get currencies error');
    res.status(500).json({ success: false, error: 'Failed to get currencies' });
  }
});

/**
 * GET /ramp/countries
 * 
 * Get supported countries for on-ramp
 */
router.get('/countries', async (req: Request, res: Response) => {
  try {
    const result = await rampService.getCountries();

    res.json({ 
      success: true, 
      countries: Array.isArray(result.data) ? result.data : []
    });
  } catch (error) {
    logger.error({ error }, 'Get countries error');
    res.status(500).json({ success: false, error: 'Failed to get countries' });
  }
});

/**
 * POST /ramp/quote
 * 
 * Get a fiat ramp quote
 */
router.post('/quote', async (req: Request, res: Response) => {
  try {
    const { 
      fiatCurrency, 
      cryptoCurrency, 
      amount, 
      isBuyOrSell, 
      partnerCustomerId,
      network,
      paymentMethod,
      country 
    } = req.body;

    const result = await rampService.getQuote({
      fiatCurrency,
      cryptoCurrency: cryptoCurrency || 'USDC',
      amount,
      isBuyOrSell: isBuyOrSell || 'BUY',
      partnerCustomerId,
      network,
      paymentMethod,
      country,
    });

    res.json({ success: true, quote: result.data });
  } catch (error) {
    logger.error({ error }, 'Get quote error');
    res.status(500).json({ success: false, error: 'Failed to get quote' });
  }
});

/**
 * POST /ramp/widget
 * 
 * Create a fiat ramp widget URL (for user to complete payment)
 */
router.post('/widget', async (req: Request, res: Response) => {
  try {
    const { quoteToken, walletAddress, walletChain } = req.body;

    if (!quoteToken || !walletAddress || !walletChain) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: quoteToken, walletAddress, walletChain' 
      });
    }

    logger.info({ walletAddress, walletChain }, 'Creating ramp widget URL');

    const result = await rampService.createWidgetUrl({
      quoteToken,
      walletAddress,
      walletChain,
    });

    res.json({ 
      success: true, 
      data: result.data,
    });
  } catch (error) {
    logger.error({ error }, 'Create widget error');
    res.status(500).json({ success: false, error: 'Failed to create widget' });
  }
});

/**
 * GET /ramp/order/:orderId
 * 
 * Get ramp order status
 */
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId as string;

    const result = await rampService.queryOrder({ orderId });

    res.json({ 
      success: true, 
      order: result.data 
    });
  } catch (error) {
    logger.error({ error, orderId: req.params.orderId }, 'Get order status error');
    res.status(500).json({ success: false, error: 'Failed to get order status' });
  }
});

/**
 * POST /ramp/on-ramp/quote
 * 
 * Get on-ramp quote (fiat -> USDC)
 */
router.post('/on-ramp/quote', async (req: Request, res: Response) => {
  try {
    const { fiatAmount, fiatCurrency, partnerCustomerId, network, paymentMethod, country } = req.body;

    if (!fiatAmount || !fiatCurrency) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: fiatAmount, fiatCurrency' 
      });
    }

    const result = await rampService.getOnRampQuote({
      fiatAmount,
      fiatCurrency,
      partnerCustomerId: partnerCustomerId || '',
      network: network || 'base',
      paymentMethod: paymentMethod || 'credit_debit_card',
      country,
    });

    res.json({ success: true, quote: result.data });
  } catch (error) {
    logger.error({ error }, 'Get on-ramp quote error');
    res.status(500).json({ success: false, error: 'Failed to get quote' });
  }
});

/**
 * POST /ramp/off-ramp/quote
 * 
 * Get off-ramp quote (USDC -> fiat)
 */
router.post('/off-ramp/quote', async (req: Request, res: Response) => {
  try {
    const { cryptoAmount, fiatCurrency, partnerCustomerId } = req.body;

    if (!cryptoAmount || !fiatCurrency) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: cryptoAmount, fiatCurrency' 
      });
    }

    const result = await rampService.getOffRampQuote({
      cryptoAmount,
      fiatCurrency,
      partnerCustomerId: partnerCustomerId || '',
    });

    res.json({ success: true, quote: result.data });
  } catch (error) {
    logger.error({ error }, 'Get off-ramp quote error');
    res.status(500).json({ success: false, error: 'Failed to get quote' });
  }
});


/**
 * POST /ramp/faucet
 *
 * Request test tokens from Cleanverse faucet
 */
router.post('/faucet', async (req: Request, res: Response) => {
  try {
    const { chain, symbol, depositAddress, amount } = req.body;

    if (!chain || !symbol || !depositAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: chain, symbol, depositAddress, amount'
      });
    }

    logger.info({ chain, symbol, depositAddress, amount }, 'Requesting faucet tokens');

    const result = await rampService.requestFaucet({
      chain,
      symbol,
      depositAddress,
      amount,
    });

    if (result.code !== '0000') {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data
    });
  } catch (error) {
    logger.error({ error }, 'Faucet request error');
    res.status(500).json({ success: false, error: 'Failed to request faucet tokens' });
  }
});
export default router;
