import { prisma } from '../../config/database';
import { getCircleWalletService } from '../circle';
import { logger } from '../../config';
import { Prisma, ContributionStatus, ContributionType } from '@prisma/client';
import {
  FundingState,
  FundingEventType,
  CircleWebhookEvent,
  TransferWebhookData,
  DepositWebhookData,
  FundingSummary,
} from './types';

/**
 * Funding Service
 * 
 * Manages deal funding state machine and contribution attribution.
 * 
 * State Machine:
 * 
 *   DRAFT → OPEN → CLOSED_FUNDED → AWAITING_DELIVERY → DELIVERED → AWAITING_REPAYMENT → COMPLETED
 *                  ↓                    ↓
 *            CLOSED_SHORTFALL       CANCELLED
 *                  ↓                    ↓
 *               REFUNDED            REFUNDED
 */
export class FundingService {
  private circleWalletService = getCircleWalletService();

  /**
   * Get current funding state for a deal
   */
  async getFundingState(dealId: string): Promise<FundingState> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { contributions: true },
    });

    if (!deal) {
      throw new Error(`Deal ${dealId} not found`);
    }

    // Check deal status for state mapping
    switch (deal.status) {
      case 'DRAFT':
        return FundingState.PENDING;
      case 'OPEN':
        // Check if expired
        if (new Date() > deal.fundingDeadline) {
          return FundingState.EXPIRED;
        }
        // Check funding level
        if (deal.runningTotal.toNumber() >= deal.targetAmount.toNumber()) {
          return FundingState.FULLY_FUNDED;
        }
        if (deal.runningTotal.toNumber() >= deal.targetAmount.toNumber() * 0.8) {
          return FundingState.FUNDED;
        }
        return FundingState.OPEN;
      case 'CLOSED_FUNDED':
        return FundingState.SETTLEMENT;
      case 'COMPLETED':
        return FundingState.COMPLETED;
      case 'CANCELLED':
      case 'CLOSED_SHORTFALL':
        return FundingState.CANCELLED;
      case 'DEFAULTED':
        return FundingState.DEFAULTED;
      default:
        return FundingState.OPEN;
    }
  }

  /**
   * Get funding summary for a deal
   */
  async getFundingSummary(dealId: string): Promise<FundingSummary> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { contributions: true },
    });

    if (!deal) {
      throw new Error(`Deal ${dealId} not found`);
    }

    const confirmedContributions = deal.contributions.filter(
      c => c.status === 'CONFIRMED'
    );

    const targetNum = deal.targetAmount.toNumber();
    const runningNum = deal.runningTotal.toNumber();
    const percentage = (runningNum / targetNum) * 100;
    const timeRemaining = deal.fundingDeadline.getTime() - Date.now();

    return {
      dealId: deal.id,
      targetAmount: targetNum.toString(),
      minimumAmount: (targetNum * 0.8).toString(), // 80% minimum
      runningTotal: runningNum.toString(),
      percentage: Math.min(percentage, 100),
      investorCount: new Set(confirmedContributions.map(c => c.investorId)).size,
      state: await this.getFundingState(dealId),
      timeRemaining: Math.max(0, timeRemaining),
    };
  }

  /**
   * Attribute a transfer to a deal contribution
   * 
   * Called by webhook handler when a transfer is detected.
   * Matches the transfer to a deal based on destination address.
   */
  async attributeTransferToDeal(params: {
    dealWalletId: string;
    dealWalletAddress: string;
    amount: string;
    currency: string;
    txHash?: string;
    sourceAddress?: string;
  }): Promise<{
    success: boolean;
    dealId?: string;
    contributionId?: string;
    error?: string;
  }> {
    const { dealWalletAddress, amount, currency, txHash, sourceAddress } = params;

    logger.info({ 
      dealWalletAddress, 
      amount, 
      currency,
      txHash 
    }, 'Attributing transfer to deal');

    try {
      // Find deal by wallet address
      const deal = await prisma.deal.findFirst({
        where: { circleWalletAddress: dealWalletAddress },
      });

      if (!deal) {
        return { success: false, error: 'No deal found for this wallet address' };
      }

      // Check if this txHash was already processed
      if (txHash) {
        const existing = await prisma.contribution.findFirst({
          where: { dealId: deal.id, txHash },
        });

        if (existing) {
          return { 
            success: false, 
            dealId: deal.id,
            contributionId: existing.id,
            error: 'Transfer already processed' 
          };
        }
      }

      // Check if deal is still accepting contributions
      if (deal.status !== 'OPEN') {
        return { 
          success: false, 
          dealId: deal.id,
          error: `Deal is not accepting contributions (status: ${deal.status})` 
        };
      }

      // Get investor from source address or create placeholder
      let investor = sourceAddress 
        ? await prisma.user.findFirst({ where: { walletAddress: sourceAddress.toLowerCase() } })
        : null;

      // Create contribution record (CONFIRMED — the transfer already settled).
      const contribution = await prisma.contribution.create({
        data: {
          dealId: deal.id,
          investorId: investor?.id || 'unknown',
          amount: amount,  // Store as string
          currency,
          type: ContributionType.CRYPTO,
          status: ContributionStatus.CONFIRMED,
          fromAddress: sourceAddress,
          toAddress: dealWalletAddress,
          txHash,
          confirmedAt: new Date(),
        },
      });

      // Update deal running total
      const updatedDeal = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          runningTotal: { increment: parseFloat(amount) },
        },
      });

      // Log funding event
      await this.logFundingEvent({
        dealId: deal.id,
        eventType: FundingEventType.CONTRIBUTION_CONFIRMED,
        data: {
          contributionId: contribution.id,
          amount,
          investorAddress: sourceAddress,
        },
      });

      // Mint POF A-Tokens for the verified deposit. Lazy import avoids the
      // deal <-> funding circular module dependency at load time.
      try {
        const { getDealService } = await import('../deal');
        await getDealService().mintTokensForContribution(contribution.id);
      } catch (mintError) {
        logger.error({ error: mintError, contributionId: contribution.id }, 'Failed to mint tokens for attributed transfer');
      }

      // Check if deal is now fully funded
      if (updatedDeal.runningTotal.toNumber() >= updatedDeal.targetAmount.toNumber()) {
        await this.logFundingEvent({
          dealId: deal.id,
          eventType: FundingEventType.FULLY_FUNDED,
          data: { totalAmount: updatedDeal.runningTotal.toString() },
        });
      }

      logger.info({ 
        dealId: deal.id,
        contributionId: contribution.id,
        newTotal: updatedDeal.runningTotal.toString() 
      }, 'Transfer attributed to deal');

      return {
        success: true,
        dealId: deal.id,
        contributionId: contribution.id,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to attribute transfer');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to attribute transfer',
      };
    }
  }

  /**
   * Check if deal meets conditions for settlement
   */
  async canInitiateSettlement(dealId: string): Promise<{
    canSettle: boolean;
    reason?: string;
  }> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { purchaseOrder: true },
    });

    if (!deal) {
      return { canSettle: false, reason: 'Deal not found' };
    }

    // Must be fully funded
    if (deal.runningTotal.toNumber() < deal.targetAmount.toNumber()) {
      return { canSettle: false, reason: 'Deal not fully funded' };
    }

    // PO must be signed
    if (deal.purchaseOrder.status !== 'SIGNED') {
      return { canSettle: false, reason: 'Purchase order not signed' };
    }

    return { canSettle: true };
  }

  /**
   * Initiate settlement for a deal
   * 
   * Pays supplier and updates deal status
   */
  async initiateSettlement(dealId: string, supplierAddress: string): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }

    if (!deal.circleWalletId) {
      return { success: false, error: 'Deal has no Circle wallet' };
    }

    const { canSettle, reason } = await this.canInitiateSettlement(dealId);
    if (!canSettle) {
      return { success: false, error: reason };
    }

    logger.info({ dealId, supplierAddress, amount: deal.targetAmount.toString() }, 'Initiating settlement');

    // Transfer to supplier
    const transferResult = await this.circleWalletService.transferFromDealWallet({
      dealWalletId: deal.circleWalletId,
      destinationAddress: supplierAddress,
      amount: deal.targetAmount.toString(),
      dealId,
    });

    if (transferResult.success) {
      // Update deal status
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: 'CLOSED_FUNDED' },
      });

      // Log event
      await this.logFundingEvent({
        dealId,
        eventType: FundingEventType.SETTLEMENT_COMPLETED,
        data: {
          transferId: transferResult.transferId,
          supplierAddress,
          amount: deal.targetAmount.toString(),
        },
      });
    }

    return transferResult;
  }

  /**
   * Process refund for expired/cancelled deal
   */
  async processRefunds(dealId: string): Promise<{
    success: boolean;
    refunds: Array<{
      investorAddress: string;
      transferId?: string;
      status: string;
    }>;
    error?: string;
  }> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { contributions: true },
    });

    if (!deal) {
      return { success: false, refunds: [], error: 'Deal not found' };
    }

    if (!deal.circleWalletId) {
      return { success: false, refunds: [], error: 'Deal has no Circle wallet' };
    }

    const confirmedContributions = deal.contributions.filter(
      c => c.status === 'CONFIRMED'
    );

    const refunds = [];

    for (const contribution of confirmedContributions) {
      // Transfer back to investor
      const result = await this.circleWalletService.transferFromDealWallet({
        dealWalletId: deal.circleWalletId,
        destinationAddress: contribution.fromAddress || 'unknown',
        amount: contribution.amount.toString(),
        dealId,
      });

      // Update contribution status
      await prisma.contribution.update({
        where: { id: contribution.id },
        data: { status: 'REFUNDED' },
      });

      refunds.push({
        investorAddress: contribution.fromAddress || 'unknown',
        transferId: result.transferId,
        status: result.success ? 'REFUNDED' : 'REFUND_FAILED',
      });
    }

    // Update deal state
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: 'CANCELLED' },
    });

    return { success: true, refunds };
  }

  /**
   * Log a funding event for audit trail
   */
  async logFundingEvent(params: {
    dealId: string;
    eventType: FundingEventType;
    data?: Record<string, any>;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        entityType: 'DEAL',
        entityId: params.dealId,
        action: params.eventType,
        details: params.data || {},
      },
    });
  }

  /**
   * Get funding events for a deal
   */
  async getFundingEvents(dealId: string, limit: number = 50): Promise<any[]> {
    return prisma.auditLog.findMany({
      where: {
        entityType: 'DEAL',
        entityId: dealId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Process expired deals
   * 
   * Called by a cron job to expire deals past their deadline
   */
  async processExpiredDeals(): Promise<{
    processed: number;
    expired: string[];
  }> {
    const expiredDeals = await prisma.deal.findMany({
      where: {
        status: 'OPEN',
        fundingDeadline: { lt: new Date() },
      },
    });

    const expired: string[] = [];

    for (const deal of expiredDeals) {
      // Check if not fully funded
      if (deal.runningTotal.toNumber() < deal.targetAmount.toNumber()) {
        await prisma.deal.update({
          where: { id: deal.id },
          data: { status: 'CLOSED_SHORTFALL' },
        });

        await this.logFundingEvent({
          dealId: deal.id,
          eventType: FundingEventType.DEAL_EXPIRED,
          data: { runningTotal: deal.runningTotal.toString() },
        });

        // Process refunds
        await this.processRefunds(deal.id);

        expired.push(deal.id);
      }
    }

    return { processed: expired.length, expired };
  }
}

// Singleton
let fundingServiceInstance: FundingService | null = null;

export function getFundingService(): FundingService {
  if (!fundingServiceInstance) {
    fundingServiceInstance = new FundingService();
  }
  return fundingServiceInstance;
}

export default getFundingService;
