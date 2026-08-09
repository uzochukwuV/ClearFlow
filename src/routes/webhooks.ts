import { Router, Request, Response } from 'express';
import { getWebhookService } from '../services/funding/webhook.service';
import { logger } from '../config';

const router = Router();
const webhookService = getWebhookService();

/**
 * POST /webhooks/circle
 * 
 * Circle webhook endpoint
 * 
 * Headers:
 * - X-Circle-Signature: HMAC-SHA256 signature of the payload
 */
router.post('/circle', async (req: Request, res: Response) => {
  try {
    // Circle sends signature in header
    const signature = req.headers['x-circle-signature'] as string || '';
    const rawBody = JSON.stringify(req.body);

    logger.debug({ 
      signature: signature.substring(0, 20),
      body: req.body 
    }, 'Received Circle webhook');

    const result = await webhookService.processWebhook(rawBody, signature);

    if (result.success) {
      res.status(200).json({ received: true, ...result });
    } else {
      res.status(400).json({ received: false, ...result });
    }
  } catch (error) {
    logger.error({ error }, 'Webhook handler error');
    res.status(500).json({ received: false, error: 'Internal error' });
  }
});

/**
 * POST /webhooks/circle/test
 * 
 * Test endpoint to manually trigger webhook processing
 */
router.post('/circle/test', async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;

    const testEvent = {
      type: type || 'transfer',
      data: {
        id: data?.id || 'test-' + Date.now(),
        attributes: data || {
          id: 'test-transfer',
          status: 'COMPLETE',
          amount: { amount: '100', currency: 'USDC' },
          destinationAddress: process.env.TEST_DEAL_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000',
          transactionHash: '0x' + '1'.repeat(64),
        },
      },
    };

    const rawBody = JSON.stringify(testEvent);
    const result = await webhookService.processWebhook(rawBody, 'test-signature');

    res.json({ test: true, event: testEvent, result });
  } catch (error) {
    logger.error({ error }, 'Webhook test error');
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /webhooks/cleanverse
 * 
 * Cleanverse webhook endpoint for A-Pass and A-Token events
 */
router.post('/cleanverse', async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;

    logger.info({ type, data }, 'Received Cleanverse webhook');

    // Handle different Cleanverse event types
    switch (type) {
      case 'atoken.issued':
        await handleATokenIssued(data);
        break;
      case 'apass.verified':
        await handleAPassVerified(data);
        break;
      case 'apass.revoked':
        await handleAPassRevoked(data);
        break;
      case 'ramp.order.completed':
      case 'ramp.order.failed':
        await handleRampOrderEvent(type, data);
        break;
      default:
        logger.info({ type }, 'Unhandled Cleanverse webhook type');
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, 'Cleanverse webhook error');
    res.status(500).json({ received: false, error: 'Internal error' });
  }
});

/**
 * Handle A-Token issued event
 */
async function handleATokenIssued(data: any) {
  const { tokenSymbol, requestId, contractAddress } = data;

  logger.info({ tokenSymbol, requestId, contractAddress }, 'A-Token issued');

  // Find deal by request ID and update with contract address
  const { prisma } = await import('../config/database');
  
  const deal = await prisma.deal.findFirst({
    where: { atokenRequestId: requestId },
  });

  if (deal) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { atokenAddress: contractAddress },
    });
    logger.info({ dealId: deal.id, contractAddress }, 'Updated deal with A-Token address');
  }
}

/**
 * Handle A-Pass verified event
 */
async function handleAPassVerified(data: any) {
  const { walletAddress, apassId, tier, expirationDate } = data;

  logger.info({ walletAddress, apassId, tier }, 'A-Pass verified');

  const { prisma } = await import('../config/database');
  
  await prisma.user.updateMany({
    where: { walletAddress: walletAddress.toLowerCase() },
    data: {
      apassId,
      apassStatus: 'ACTIVE',
      apassTier: tier,
      apassExpiration: new Date(expirationDate),
    },
  });
}

/**
 * Handle A-Pass revoked event
 */
async function handleAPassRevoked(data: any) {
  const { walletAddress, apassId, reason } = data;

  logger.info({ walletAddress, apassId, reason }, 'A-Pass revoked');

  const { prisma } = await import('../config/database');
  
  await prisma.user.updateMany({
    where: { walletAddress: walletAddress.toLowerCase() },
    data: {
      apassStatus: 'FROZEN',
    },
  });
}

/**
 * Handle Cleanverse ramp order events (completed / failed).
 *
 * On completion we enqueue a verification+mint job so the contribution's
 * USDC landing in the deal wallet is confirmed before tokens are minted.
 * On failure we mark the contribution FAILED.
 */
async function handleRampOrderEvent(type: string, data: any) {
  const { orderId, quoteToken, txHash, status } = data || {};

  logger.info({ type, orderId, quoteToken, status, txHash }, 'Ramp order event');

  const { prisma } = await import('../config/database');

  // Locate the contribution by rampOrderId or rampQuoteToken.
  const contribution = await prisma.contribution.findFirst({
    where: {
      OR: [
        { rampOrderId: orderId },
        { rampQuoteToken: quoteToken },
      ],
    },
  });
  if (!contribution) {
    logger.warn({ orderId, quoteToken }, 'Ramp event: no matching contribution');
    return;
  }

  if (type === 'ramp.order.failed') {
    await prisma.contribution.update({
      where: { id: contribution.id },
      data: { status: 'FAILED' },
    });
    logger.warn({ contributionId: contribution.id, orderId }, 'Ramp order failed — contribution FAILED');
    return;
  }

  // ramp.order.completed — store the ramp tx hash and enqueue verification.
  await prisma.contribution.update({
    where: { id: contribution.id },
    data: {
      rampTxHash: txHash,
      rampOrderId: orderId || contribution.rampOrderId,
    },
  });

  try {
    const { addJob } = await import('../jobs/queue');
    await addJob('poll-ramp-order', { contributionId: contribution.id }, { attempts: 30 });
    logger.info({ contributionId: contribution.id, orderId }, 'Enqueued ramp-order verification job');
  } catch (jobError) {
    logger.error({ error: jobError, contributionId: contribution.id }, 'Could not enqueue ramp verification job');
  }
}

export default router;
