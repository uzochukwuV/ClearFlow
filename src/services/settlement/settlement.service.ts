import { prisma } from '../../config/database';
import { getCircleWalletService } from '../circle';
import { logger } from '../../config';
import {
  SettlementStatus,
  SettlementEventType,
  SettlementSummary,
  InvestorPayoutCalculation,
  InitiateSettlementParams,
  ConfirmDeliveryParams,
  RecordRepaymentParams,
} from './types';

/**
 * Settlement Service
 * 
 * Manages the complete deal lifecycle from funding completion to investor payouts.
 * 
 * Lifecycle:
 * 
 *  1. FUNDING_COMPLETE
 *     ↓
 *  2. SUPPLIER_PAID (Circle transfer to supplier)
 *     ↓
 *  3. DELIVERY_PENDING (Buyer confirms receipt)
 *     ↓
 *  4. DELIVERY_CONFIRMED (Both parties confirm)
 *     ↓
 *  5. REPAYMENT_PENDING (Buyer pays back)
 *     ↓
 *  6. REPAYMENT_RECEIVED
 *     ↓
 *  7. DISTRIBUTING (Investors get principal + yield)
 *     ↓
 *  8. COMPLETED
 */
export class SettlementService {
  private circleWalletService = getCircleWalletService();

  /**
   * Check if deal is ready for settlement
   */
  async canInitiateSettlement(dealId: string): Promise<{
    canSettle: boolean;
    reason?: string;
    missingItems?: string[];
  }> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: {
          include: { supplier: true },
        },
        contributions: {
          where: { status: 'CONFIRMED' },
        },
      },
    });

    if (!deal) {
      return { canSettle: false, reason: 'Deal not found' };
    }

    const missingItems: string[] = [];

    // Check if fully funded
    const runningTotal = parseFloat(deal.runningTotal.toString());
    const targetAmount = parseFloat(deal.targetAmount.toString());
    if (runningTotal < targetAmount) {
      missingItems.push(`Funding incomplete: ${deal.runningTotal}/${deal.targetAmount}`);
    }

    // Check PO is signed
    if (deal.purchaseOrder.status !== 'SIGNED') {
      missingItems.push('Purchase order not signed');
    }

    // Check Circle wallet exists
    if (!deal.circleWalletId) {
      missingItems.push('Circle wallet not configured');
    }

    return {
      canSettle: missingItems.length === 0,
      reason: missingItems.length > 0 ? 'Missing requirements' : undefined,
      missingItems: missingItems.length > 0 ? missingItems : undefined,
    };
  }

  /**
   * Get settlement summary for a deal
   */
  async getSettlementSummary(dealId: string): Promise<SettlementSummary> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: true,
        contributions: {
          where: { status: 'CONFIRMED' },
        },
        repayments: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!deal) {
      throw new Error(`Deal ${dealId} not found`);
    }

    const confirmedContributions = deal.contributions;
    const investorCount = new Set(confirmedContributions.map(c => c.investorId)).size;

    // Determine settlement status
    let status: SettlementStatus;
    const delivery = deal.deliveries[0];
    const repayment = deal.repayments[0];

    if (deal.status === 'COMPLETED') {
      status = SettlementStatus.COMPLETED;
    } else if (repayment && repayment.paidAt) {
      status = SettlementStatus.DISTRIBUTING;
    } else if (repayment) {
      status = SettlementStatus.REPAYMENT_RECEIVED;
    } else if (delivery?.status === 'CONFIRMED') {
      status = SettlementStatus.REPAYMENT_PENDING;
    } else if (delivery) {
      status = SettlementStatus.DELIVERY_PENDING;
    } else if (deal.status === 'CLOSED_FUNDED') {
      status = SettlementStatus.SUPPLIER_PAID;
    } else if (deal.status === 'AWAITING_DELIVERY') {
      status = SettlementStatus.DELIVERY_PENDING;
    } else if (deal.status === 'AWAITING_REPAYMENT') {
      status = SettlementStatus.REPAYMENT_PENDING;
    } else {
      status = SettlementStatus.PENDING;
    }

    // Calculate completion percentage
    let completionPercentage = 0;
    if (deal.status === 'COMPLETED') completionPercentage = 100;
    else if (status === SettlementStatus.DISTRIBUTING) completionPercentage = 90;
    else if (status === SettlementStatus.REPAYMENT_RECEIVED) completionPercentage = 75;
    else if (status === SettlementStatus.REPAYMENT_PENDING) completionPercentage = 60;
    else if (status === SettlementStatus.DELIVERY_PENDING && delivery?.status === 'BUYER_CONFIRMED') completionPercentage = 45;
    else if (status === SettlementStatus.DELIVERY_PENDING) completionPercentage = 40;
    else if (status === SettlementStatus.SUPPLIER_PAID) completionPercentage = 25;

    return {
      dealId: deal.id,
      status,
      supplierPaid: deal.status === 'CLOSED_FUNDED' || deal.status === 'AWAITING_DELIVERY',
      deliveryConfirmed: delivery?.status === 'CONFIRMED',
      repaymentReceived: !!repayment?.paidAt,
      repaymentAmount: repayment?.amount.toString(),
      repaymentDueDate: deal.purchaseOrder.deliveryDate,
      investorCount,
      completionPercentage,
    };
  }

  /**
   * Initiate settlement - pay supplier from Circle wallet
   */
  async initiateSettlement(params: InitiateSettlementParams): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> {
    const { dealId, operatorAddress } = params;

    logger.info({ dealId, operatorAddress }, 'Initiating settlement');

    // Check if can settle
    const canSettle = await this.canInitiateSettlement(dealId);
    if (!canSettle.canSettle) {
      return {
        success: false,
        error: `Cannot initiate settlement: ${canSettle.missingItems?.join(', ')}`,
      };
    }

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: {
          include: { supplier: true },
        },
      },
    });

    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }

    // Get supplier address from purchase order
    const supplierAddress = deal.purchaseOrder.supplier.walletAddress;
    const amount = deal.targetAmount.toString();  // Already a string

    logger.info({ dealId, supplierAddress, amount }, 'Transferring to supplier');

    // Check if Circle wallet exists for real transfer
    let transferResult: { success: boolean; transferId?: string; error?: string; status?: string };
    
    if (deal.circleWalletId && process.env.SKIP_CIRCLE_WALLET !== 'true') {
      // Real Circle transfer
      transferResult = await this.circleWalletService.transferFromDealWallet({
        dealWalletId: deal.circleWalletId,
        destinationAddress: supplierAddress,
        amount,
        dealId,
      });
    } else {
      // Demo mode - simulate successful transfer
      logger.info({ dealId, supplierAddress, amount }, 'Demo mode: Simulating Circle transfer');
      transferResult = {
        success: true,
        transferId: `DEMO-SETTLE-${Date.now()}-${dealId.substring(0, 8)}`,
        status: 'COMPLETED',
      };
    }

    if (transferResult.success) {
      // Update deal status
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: 'CLOSED_FUNDED' },
      });

      // Create delivery record
      await prisma.delivery.create({
        data: {
          dealId,
          status: 'PENDING',
        },
      });

      // Log event
      await this.logSettlementEvent({
        dealId,
        eventType: SettlementEventType.SUPPLIER_PAYMENT_SENT,
        data: {
          transferId: transferResult.transferId,
          supplierAddress,
          amount,
          txHash: transferResult.status,
          demoMode: deal.circleWalletId ? false : true,
        },
      });

      logger.info({ dealId, transferId: transferResult.transferId }, 'Supplier payment sent');
    } else {
      await this.logSettlementEvent({
        dealId,
        eventType: SettlementEventType.SETTLEMENT_FAILED,
        data: { error: transferResult.error },
      });
    }

    return transferResult;
  }

  /**
   * Confirm delivery by buyer or supplier
   */
  async confirmDelivery(params: ConfirmDeliveryParams): Promise<{
    success: boolean;
    deliveryConfirmed?: boolean;
    error?: string;
  }> {
    const { dealId, confirmerAddress, confirmerType, notes } = params;

    logger.info({ dealId, confirmerType, confirmerAddress }, 'Confirming delivery');

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: true,
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }

    const delivery = deal.deliveries[0];
    if (!delivery) {
      return { success: false, error: 'No delivery record found' };
    }

    if (delivery.status !== 'PENDING') {
      return { success: false, error: 'Delivery already confirmed or disputed' };
    }

    // Verify address matches buyer or supplier
    const isBuyer = deal.purchaseOrder.buyerId;
    const isSupplier = deal.purchaseOrder.supplierId;

    // Get user ID from address
    const user = await prisma.user.findFirst({
      where: { walletAddress: confirmerAddress.toLowerCase() },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const isAuthorized = user.id === isBuyer || user.id === isSupplier;
    if (!isAuthorized) {
      return { success: false, error: 'Not authorized to confirm delivery' };
    }

    // Update delivery
    const updateData: any = {};
    let eventType: SettlementEventType;

    if (confirmerType === 'BUYER') {
      updateData.buyerSignature = 'confirmed';
      updateData.buyerSignedAt = new Date();
      eventType = SettlementEventType.DELIVERY_CONFIRMED_BY_BUYER;
    } else {
      updateData.supplierSignature = 'confirmed';
      updateData.supplierSignedAt = new Date();
      eventType = SettlementEventType.DELIVERY_CONFIRMED_BY_SUPPLIER;
    }

    if (notes) updateData.notes = notes;

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: updateData,
    });

    // Check if both confirmed
    const updatedDelivery = await prisma.delivery.findUnique({
      where: { id: delivery.id },
    });

    let deliveryConfirmed = false;
    if (updatedDelivery?.buyerSignature && updatedDelivery?.supplierSignature) {
      await prisma.delivery.update({
        where: { id: delivery.id },
        data: { status: 'CONFIRMED' },
      });

      // Update deal status
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: 'AWAITING_REPAYMENT' },
      });

      deliveryConfirmed = true;

      await this.logSettlementEvent({
        dealId,
        eventType: SettlementEventType.DELIVERY_CONFIRMED_BY_SUPPLIER,
        data: { bothConfirmed: true },
      });
    }

    await this.logSettlementEvent({
      dealId,
      eventType,
      data: {
        confirmerType,
        confirmerAddress,
        notes,
      },
    });

    return {
      success: true,
      deliveryConfirmed,
    };
  }

  /**
   * Record repayment from buyer
   */
  async recordRepayment(params: RecordRepaymentParams): Promise<{
    success: boolean;
    repaymentId?: string;
    totalReceived?: string;
    fullyRepaid?: boolean;
    error?: string;
  }> {
    const { dealId, amount, txHash, fromAddress } = params;

    logger.info({ dealId, amount, txHash }, 'Recording repayment');

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { repayments: true },
    });

    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }

    // Calculate total repayment (principal + yield)
    const principal = parseFloat(deal.targetAmount.toString());
    const yieldPercent = deal.yieldPercent / 100;
    const yieldAmount = principal * yieldPercent;
    const totalRepayment = principal + yieldAmount;

    // Check what's already been repaid
    const alreadyRepaid = deal.repayments
      .filter(r => r.paidAt)
      .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

    const remaining = totalRepayment - alreadyRepaid;

    if (parseFloat(amount) > remaining) {
      return {
        success: false,
        error: `Amount exceeds remaining repayment. Remaining: ${remaining}`,
      };
    }

    // Create repayment record
    const repayment = await prisma.repayment.create({
      data: {
        dealId,
        amount: amount,  // Store as string
        currency: deal.currency,
        txHash,
        paidAt: new Date(),
      },
    });

    // Log event
    await this.logSettlementEvent({
      dealId,
      eventType: SettlementEventType.REPAYMENT_RECEIVED,
      data: {
        repaymentId: repayment.id,
        amount,
        txHash,
      },
    });

    // Check if fully repaid
    const newTotalRepaid = alreadyRepaid + parseFloat(amount);
    const fullyRepaid = newTotalRepaid >= totalRepayment;

    if (fullyRepaid) {
      // Set status to READY_FOR_DISTRIBUTION so investors can claim
      await prisma.deal.update({
        where: { id: dealId },
        data: { status: 'READY_FOR_DISTRIBUTION' },
      });

      logger.info({ dealId, totalRepaid: newTotalRepaid }, 'Deal fully repaid, ready for distribution');

      // Create investor payout records (investors will claim manually)
      await this.calculateAndDistributePayouts(dealId);
    }

    return {
      success: true,
      repaymentId: repayment.id,
      totalReceived: newTotalRepaid.toString(),
      fullyRepaid,
    };
  }

  /**
   * Calculate payouts for investors (NO auto-distribution)
   * 
   * Each investor's payout is proportional to their A-token holdings.
   * Admin takes 3% of the yield as fee.
   * Investors must claim manually.
   */
  async calculateAndDistributePayouts(dealId: string): Promise<{
    success: boolean;
    payouts?: InvestorPayoutCalculation[];
    error?: string;
  }> {
    logger.info({ dealId }, 'Calculating investor payouts');

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        contributions: {
          where: { status: 'CONFIRMED' },
          include: { investor: true },
        },
      },
    });

    if (!deal) {
      return { success: false, error: 'Deal not found' };
    }

    // Calculate total funded and total supply (A-tokens)
    const totalFunded = deal.contributions.reduce(
      (sum, c) => sum + parseFloat(c.amount.toString()),
      0
    );
    const totalSupply = parseFloat(deal.totalSupply.toString()) || totalFunded;

    // Calculate repayment amount (principal + yield)
    const principal = parseFloat(deal.targetAmount.toString());
    const yieldPercent = deal.yieldPercent / 100;
    const totalYield = principal * yieldPercent;
    
    // Admin takes 3% of yield
    const ADMIN_FEE_PERCENT = 3;
    const adminFee = totalYield * (ADMIN_FEE_PERCENT / 100);
    const investorTotalYield = totalYield - adminFee;
    const totalPayout = principal + investorTotalYield;

    logger.info({ 
      dealId, 
      principal, 
      totalYield, 
      adminFee, 
      investorTotalYield,
      totalSupply,
      ADMIN_FEE_PERCENT 
    }, 'Payout calculation with admin fee');

    // Calculate each investor's payout based on their A-token holdings
    const payouts: InvestorPayoutCalculation[] = [];

    for (const contribution of deal.contributions) {
      const contributionAmount = parseFloat(contribution.amount.toString());
      const tokenAmount = contributionAmount; // 1:1 ratio
      
      // Investor's share = their tokens / total supply
      const proportion = totalSupply > 0 ? tokenAmount / totalSupply : 0;
      
      // Investor gets principal back + their share of yield (minus admin fee)
      const investorPrincipal = contributionAmount;
      const investorYield = investorTotalYield * proportion;
      const investorPayout = investorPrincipal + investorYield;
      
      // Admin fee for this investor
      const investorAdminFee = adminFee * proportion;

      payouts.push({
        investorId: contribution.investorId,
        investorAddress: contribution.fromAddress || contribution.investor.walletAddress,
        contributionAmount: contribution.amount.toString(),
        proportion,
        principal: investorPrincipal.toString(),
        yieldAmount: investorYield.toString(),
        totalPayout: investorPayout.toString(),
        tokenAmount: tokenAmount.toString(),
      });

      // Create investor payout record
      await prisma.investorPayout.create({
        data: {
          dealId,
          investorId: contribution.investorId,
          principal: investorPrincipal.toString(),
          yieldAmount: investorYield.toString(),
          total: investorPayout.toString(),
          tokenAmount: tokenAmount.toString(),
          status: 'PENDING',
        },
      });
    }

    // Log calculation
    await this.logSettlementEvent({
      dealId,
      eventType: SettlementEventType.PAYOUT_CALCULATED,
      data: {
        principal,
        totalYield,
        adminFee,
        investorTotalYield,
        totalPayout,
        investorCount: payouts.length,
        yields: payouts.map(p => ({
          investorId: p.investorId,
          tokenAmount: p.tokenAmount,
          proportion: p.proportion,
          yieldAmount: p.yieldAmount,
          payout: p.totalPayout,
        })),
      },
    });

    // DO NOT auto-distribute - investors must claim manually
    // Just mark the deal as READY_FOR_DISTRIBUTION
    logger.info({ dealId, investorCount: payouts.length }, 'Payouts calculated, investors can now claim');

    return { success: true, payouts };
  }

  /**
   * Get investor payouts for a deal
   */
  async getInvestorPayouts(dealId: string): Promise<any[]> {
    return prisma.investorPayout.findMany({
      where: { dealId },
      include: { investor: true },
    });
  }

  /**
   * Log settlement event
   */
  private async logSettlementEvent(params: {
    dealId: string;
    eventType: SettlementEventType;
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
   * Get settlement events for a deal
   */
  async getSettlementEvents(dealId: string, limit: number = 50): Promise<any[]> {
    return prisma.auditLog.findMany({
      where: {
        entityType: 'DEAL',
        entityId: dealId,
        action: {
          in: Object.values(SettlementEventType),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

// Singleton
let settlementServiceInstance: SettlementService | null = null;

export function getSettlementService(): SettlementService {
  if (!settlementServiceInstance) {
    settlementServiceInstance = new SettlementService();
  }
  return settlementServiceInstance;
}

export default getSettlementService;
