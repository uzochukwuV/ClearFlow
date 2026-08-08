import crypto from 'crypto';
import { getFundingService } from './funding.service';
import { logger } from '../../config';
import { CircleWebhookEvent } from './types';

/**
 * Webhook Service
 * 
 * Handles incoming webhooks from Circle for:
 * - Wallet transfers (USDC sent to deal wallets)
 * - Deposits
 * - Payment events
 */
export class WebhookService {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.CIRCLE_WEBHOOK_SECRET || '';
  }

  /**
   * Verify webhook signature from Circle
   * 
   * Circle signs webhooks using HMAC-SHA256.
   * Signature header: X-Circle-Signature
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.warn('CIRCLE_WEBHOOK_SECRET not configured - skipping signature verification');
      return true; // Allow in development
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse and process incoming webhook
   */
  async processWebhook(rawBody: string, signature: string): Promise<{
    success: boolean;
    message: string;
    attributionResult?: any;
  }> {
    // Verify signature
    if (!this.verifySignature(rawBody, signature)) {
      logger.warn('Invalid webhook signature');
      return { success: false, message: 'Invalid signature' };
    }

    let event: CircleWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { success: false, message: 'Invalid JSON payload' };
    }

    logger.info({ 
      type: event.type, 
      id: event.data?.id 
    }, 'Processing Circle webhook');

    try {
      switch (event.type) {
        case 'transfer':
          return await this.handleTransfer(event);
        
        case 'deposit':
          return await this.handleDeposit(event);
        
        case 'payment':
          return await this.handlePayment(event);
        
        default:
          logger.info({ type: event.type }, 'Unhandled webhook type');
          return { success: true, message: `Unhandled type: ${event.type}` };
      }
    } catch (error) {
      logger.error({ error, event }, 'Webhook processing failed');
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  /**
   * Handle transfer webhook
   * 
   * Transfer completed to/from our wallets
   */
  async handleTransfer(event: CircleWebhookEvent): Promise<{
    success: boolean;
    message: string;
    attributionResult?: any;
  }> {
    const transfer = event.data?.attributes;
    
    if (!transfer) {
      return { success: false, message: 'Missing transfer data' };
    }

    logger.info({
      transferId: transfer.id || event.data?.id,
      status: transfer.status,
      amount: transfer.amount?.amount,
      destination: transfer.destinationAddress,
    }, 'Processing transfer webhook');

    // Only process completed transfers
    if (transfer.status !== 'COMPLETE') {
      return { success: true, message: `Transfer status: ${transfer.status}` };
    }

    // Find the deal wallet by destination address
    const deal = await import('../../config/database').then(m => 
      m.prisma.deal.findFirst({
        where: { circleWalletAddress: transfer.destinationAddress },
      })
    );

    if (!deal) {
      // Transfer to unknown wallet - might be our admin wallet or other
      logger.info({ address: transfer.destinationAddress }, 'Transfer to unknown wallet');
      return { success: true, message: 'Unknown wallet - no attribution' };
    }

    // Attribute the transfer to the deal
    const fundingService = getFundingService();
    const attributionResult = await fundingService.attributeTransferToDeal({
      dealWalletId: deal.circleWalletId!,
      dealWalletAddress: transfer.destinationAddress,
      amount: transfer.amount?.amount || '0',
      currency: transfer.amount?.currency || 'USDC',
      txHash: transfer.transactionHash,
      sourceAddress: transfer.sourceWalletId,
    });

    return {
      success: attributionResult.success,
      message: attributionResult.success 
        ? 'Transfer attributed to deal' 
        : attributionResult.error || 'Attribution failed',
      attributionResult,
    };
  }

  /**
   * Handle deposit webhook
   * 
   * USDC deposited to our wallets
   */
  async handleDeposit(event: CircleWebhookEvent): Promise<{
    success: boolean;
    message: string;
  }> {
    const deposit = event.data?.attributes;

    if (!deposit) {
      return { success: false, message: 'Missing deposit data' };
    }

    logger.info({
      depositId: deposit.id || event.data?.id,
      status: deposit.status,
      amount: deposit.amount?.amount,
      address: deposit.address,
    }, 'Processing deposit webhook');

    if (deposit.status !== 'COMPLETE') {
      return { success: true, message: `Deposit status: ${deposit.status}` };
    }

    // Deposits typically come from external sources
    // Try to match by address to deal wallet
    const deal = await import('../../config/database').then(m => 
      m.prisma.deal.findFirst({
        where: { circleWalletAddress: deposit.address },
      })
    );

    if (deal) {
      const fundingService = getFundingService();
      await fundingService.attributeTransferToDeal({
        dealWalletId: deal.circleWalletId!,
        dealWalletAddress: deposit.address,
        amount: deposit.amount?.amount || '0',
        currency: deposit.amount?.currency || 'USDC',
        txHash: deposit.transactionHash,
        sourceAddress: deposit.fromAddress,
      });
    }

    return { success: true, message: 'Deposit processed' };
  }

  /**
   * Handle payment webhook
   * 
   * Circle Payment Network events
   */
  async handlePayment(event: CircleWebhookEvent): Promise<{
    success: boolean;
    message: string;
  }> {
    const payment = event.data?.attributes;

    if (!payment) {
      return { success: false, message: 'Missing payment data' };
    }

    logger.info({
      paymentId: payment.id || event.data?.id,
      status: payment.status,
    }, 'Processing payment webhook');

    return { success: true, message: 'Payment webhook received' };
  }
}

// Singleton
let webhookServiceInstance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!webhookServiceInstance) {
    webhookServiceInstance = new WebhookService();
  }
  return webhookServiceInstance;
}

export default getWebhookService;
