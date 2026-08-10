import { prisma } from '../../config/database';
import { getIdentityService } from '../identity';
import { getATokenService, getRampService } from '../cleanverse';
import { getCircleWalletService } from '../circle';
import { getDepositVerificationService } from '../funding';
import { CircleBlockchain } from '../circle/types';
import { ContributionStatus, ContributionType } from '@prisma/client';
import { logger } from '../../config';

export interface CreateDealResult {
  success: boolean;
  dealId?: string;
  atokenSymbol?: string;
  circleWalletId?: string;
  error?: string;
}

export interface ContributeResult {
  success: boolean;
  contributionId?: string;
  contributionStatus?: string;
  tokenAmount?: string;
  // Crypto path
  dealWalletAddress?: string;
  txHash?: string;
  // Fiat path
  rampOrderId?: string;
  rampQuoteToken?: string;
  rampWidgetUrl?: string;
  rampTxHash?: string;
  adminAddress?: string;
  error?: string;
}

export interface DealWithDetails {
  id: string;
  purchaseOrderId: string;
  buyerAddress?: string;
  supplierAddress?: string;
  purchaseOrder?: {
    poReference: string;
    amount: string;
    currency: string;
    buyerAddress?: string;
    supplierAddress?: string;
    deliveryDate?: Date;
  };
  chain: string;
  targetAmount: string;
  runningTotal: string;
  currency: string;
  fundingDeadline: Date;
  deliveryDeadline?: Date;
  yieldPercent: number;
  status: string;
  atokenSymbol?: string;
  atokenAddress?: string;
  circleWalletId?: string;
  circleWalletAddress?: string;
  minInvestorTier: number;
  eligibleCountries: string[];
  createdAt: Date;
  updatedAt: Date;
  contributions?: ContributionWithInvestor[];
}

export interface ContributionWithInvestor {
  id: string;
  investorAddress: string;
  amount: string;
  tokenAmount: string;
  status: string;
  createdAt: Date;
}

export interface InvestorPosition {
  dealId: string;
  dealSymbol: string;
  tokenAmount: string;
  principalUsdc: string;
  expectedYield: string;
  totalValue: string;
  status: string;
}

export class DealService {
  private identityService = getIdentityService();
  private aTokenService = getATokenService();
  private circleWalletService = getCircleWalletService();
  private rampService = getRampService();
  private depositVerificationService = getDepositVerificationService();

  /**
   * Create a Financing Deal
   * 
   * Flow:
   * 1. Verify PO is signed by both parties
   * 2. Create deal in database
   * 3. Create Circle deal wallet for USDC settlement
   * 4. Mint ONE POF A-Token series for this deal
   * 
   * The POF token is compliance-gated and represents financing positions.
   * The Circle wallet handles all USDC transfers for this deal.
   */
  async createDeal(params: {
    buyerAddress: string;
    purchaseOrderId: string;
    targetAmount: string;
    yieldPercent: number;
    fundingDeadline: Date;
    deliveryDeadline?: Date;
    minInvestorTier: number;
    eligibleCountries: string[];
    chain: string;
  }): Promise<CreateDealResult> {
    const { 
      buyerAddress, 
      purchaseOrderId, 
      targetAmount, 
      yieldPercent, 
      fundingDeadline,
      deliveryDeadline,
      minInvestorTier,
      eligibleCountries,
      chain
    } = params;

    logger.info({ 
      buyerAddress, 
      purchaseOrderId, 
      targetAmount 
    }, 'Creating Financing Deal');

    try {
      // 1. Verify PO exists and is SIGNED
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { buyer: true, supplier: true, signatures: true },
      });

      if (!po) {
        return { success: false, error: 'Purchase Order not found' };
      }

      if (po.status !== 'SIGNED') {
        return { success: false, error: `Purchase Order must be signed. Current status: ${po.status}` };
      }

      // Verify buyer matches
      if (po.buyer.walletAddress.toLowerCase() !== buyerAddress.toLowerCase()) {
        return { success: false, error: 'Only the PO buyer can create a deal' };
      }

      // 2. Create deal in database
      const deal = await prisma.deal.create({
        data: {
          purchaseOrderId,
          chain,
          targetAmount: parseFloat(targetAmount),
          currency: 'USDC',
          fundingDeadline,
          deliveryDeadline,
          yieldPercent,
          status: "DRAFT",
          minInvestorTier,
          eligibleCountries,
        },
      });

      // 3. Create Circle deal wallet for USDC settlement (skip in demo mode)
      const skipCircleWallet = process.env.SKIP_CIRCLE_WALLET === 'true';
      let circleWalletResult: { success: boolean; walletId?: string; address?: string; error?: string } = 
        { success: true, walletId: 'demo-wallet-id', address: '0x' + '0'.repeat(40) };
      
      if (!skipCircleWallet) {
        circleWalletResult = await this.circleWalletService.createDealWallet(
          deal.id,
          chain as CircleBlockchain
        );

        if (!circleWalletResult.success) {
          // Rollback deal creation
          await prisma.deal.delete({ where: { id: deal.id } });
          return {
            success: false,
            error: `Failed to create Circle wallet: ${circleWalletResult.error || 'Unknown error'}`,
          };
        }
      } else {
        logger.info({ dealId: deal.id }, 'Skipping Circle wallet creation (demo mode)');
      }

      // 4. Mint POF A-Token for this deal
      // Generate token symbol: POF-{first 6 chars of deal id}
      const atokenSymbol = `POF-${deal.id.substring(0, 6).toUpperCase()}`;
      
      const aTokenResult = await this.aTokenService.launch({
        chain,
        tokenName: `POF #${deal.id.substring(0, 6)}`,
        tokenSymbol: atokenSymbol,
        adminAddress: buyerAddress, // Or a platform admin
        rule: {
          min_tier: minInvestorTier,
          countries: eligibleCountries.length > 0 ? eligibleCountries : undefined,
          is_black_list: eligibleCountries.length > 0 ? false : undefined,
        },
        icon: 'https://example.com/pof-token-icon.png',  // Required by API
      });

      if (!this.aTokenService.isSuccess(aTokenResult)) {
        // Rollback deal creation and Circle wallet
        await prisma.deal.delete({ where: { id: deal.id } });
        return { 
          success: false, 
          error: `Failed to mint POF token: ${this.aTokenService.getError(aTokenResult)}` 
        };
      }

      // 5. Update deal with Circle wallet and A-Token info
      const updatedDeal = await prisma.deal.update({
        where: { id: deal.id },
        data: {
          circleWalletId: circleWalletResult.walletId,
          circleWalletAddress: circleWalletResult.address,
          atokenRequestId: aTokenResult.data?.requestId,
          atokenSymbol,
          status: "OPEN",
        },
      });

      logger.info({ 
        dealId: deal.id, 
        atokenSymbol,
        status: "OPEN"
      }, 'Financing Deal created - POF token minted');

      return {
        success: true,
        dealId: deal.id,
        atokenSymbol,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create Financing Deal');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create deal',
      };
    }
  }

  /**
   * Contribute to a Deal — unified Intent → Verify → Mint pipeline.
   *
   * Two payment paths, both funnelling through one verification layer:
   *
   *   CRYPTO  — investor sends USDC directly to the deal wallet on-chain.
   *             Backend returns the deal wallet address + expected amount; the
   *             investor performs the transfer out-of-band. Verification happens
   *             asynchronously via DepositVerificationService (Circle
   *             listTransactions + on-chain balanceOf). Tokens are minted only
   *             once the deposit is CONFIRMED.
   *
   *   FIAT    — investor pays fiat via the Cleanverse ramp. Backend obtains a
   *             ramp quote, creates the widget URL for the investor to complete
   *             payment, and records the rampOrderId / rampQuoteToken.
   *             Verification polls query_ramp_order to COMPLETED, then confirms
   *             the USDC landed in the deal wallet. Tokens minted on CONFIRMED.
   *
   * In both cases the Contribution is created PENDING and only the
   * DepositVerificationService flips it to CONFIRMED. `mintTokensOnConfirm`
   * controls whether this call blocks on verification (synchronous) or leaves
   * it to the background poll-ramp-order / verify-deposit jobs (async).
   */
  async contribute(params: {
    investorAddress: string;
    adminAddress: string;
    dealId: string;
    amount: string;
    chain: string;
    paymentMethod?: 'CRYPTO' | 'FIAT';
    // Fiat-ramp inputs (only used when paymentMethod === 'FIAT')
    fiatCurrency?: string;
    partnerCustomerId?: string;
    // When true, block until the deposit verifies and mint immediately.
    // Default false → return PENDING and let background jobs verify + mint.
    mintTokensOnConfirm?: boolean;
  }): Promise<ContributeResult> {
    const {
      investorAddress,
      adminAddress,
      dealId,
      amount,
      chain,
      paymentMethod = 'CRYPTO',
      fiatCurrency,
      partnerCustomerId,
      mintTokensOnConfirm = false,
    } = params;

    logger.info(
      { investorAddress, adminAddress, dealId, amount, paymentMethod },
      'Processing contribution'
    );

    try {
      // 1. Get deal + guard
      const deal = await prisma.deal.findUnique({ where: { id: dealId } });
      if (!deal) return { success: false, error: 'Deal not found' };
      if (deal.status !== 'OPEN') {
        return { success: false, error: `Deal is not open for contributions. Status: ${deal.status}` };
      }
      if (!deal.circleWalletId || !deal.circleWalletAddress) {
        return { success: false, error: 'Deal has no Circle wallet' };
      }

      // 2. Verify investor A-Pass + compliance rules (unless demo mode)
      const skipAPassVerification = process.env.SKIP_APASS_VERIFICATION === 'true';
      if (!skipAPassVerification) {
        const aPassVerification = await this.identityService.verifyAPass(investorAddress, chain);
        if (!aPassVerification.valid) {
          logger.warn(
            { investorAddress, dealId, reason: aPassVerification.reason, tier: aPassVerification.tier, countries: aPassVerification.countries },
            'A-Pass verification failed'
          );
          return { success: false, error: `Investor A-Pass verification failed: ${aPassVerification.reason}` };
        }
        if (deal.minInvestorTier && aPassVerification.tier !== undefined) {
          if (aPassVerification.tier < deal.minInvestorTier) {
            logger.warn(
              { investorAddress, dealId, tier: aPassVerification.tier, minInvestorTier: deal.minInvestorTier },
              'Investor tier below minimum for deal'
            );
            return { success: false, error: `Investor tier ${aPassVerification.tier} below minimum ${deal.minInvestorTier}` };
          }
        }
        if (deal.eligibleCountries.length > 0 && aPassVerification.countries) {
          const hasEligibleCountry = aPassVerification.countries.some((c: string) =>
            deal.eligibleCountries.includes(c)
          );
          if (!hasEligibleCountry) {
            logger.warn(
              { investorAddress, dealId, countries: aPassVerification.countries, eligibleCountries: deal.eligibleCountries },
              'Investor country not eligible for deal'
            );
            return { success: false, error: `Investor country not eligible for this deal. Eligible: ${deal.eligibleCountries.join(', ')}` };
          }
        }
      } else {
        logger.info({ investorAddress }, 'Skipping A-Pass verification (demo mode)');
      }

      // 3. Find or create investor user
      let investor = await prisma.user.findUnique({
        where: { walletAddress: investorAddress.toLowerCase() },
      });
      if (!investor) {
        investor = await prisma.user.create({
          data: { walletAddress: investorAddress.toLowerCase(), userType: 'INVESTOR' },
        });
      }

      // 4. INTENT — create the Contribution PENDING with full provenance
      const contributionType: ContributionType =
        paymentMethod === 'FIAT' ? ContributionType.FIAT : ContributionType.CRYPTO;

      const contribution = await prisma.contribution.create({
        data: {
          dealId,
          investorId: investor.id,
          amount,
          currency: 'USDC',
          type: contributionType,
          status: ContributionStatus.PENDING,
          toAddress: deal.circleWalletAddress,
          fromAddress: contributionType === ContributionType.CRYPTO ? investorAddress.toLowerCase() : null,
        },
      });

      // 5. FUNDING SOURCE — record how the investor will pay
      let rampOrderId: string | undefined;
      let rampQuoteToken: string | undefined;
      let rampWidgetUrl: string | undefined;

      if (contributionType === ContributionType.FIAT) {
        // Real ramp flow: quote → widget URL. Investor completes payment out-of-band.
        const quoteRes = await this.rampService.getOnRampQuote({
          fiatAmount: amount,
          fiatCurrency: fiatCurrency || 'USD',
          partnerCustomerId: partnerCustomerId || investor.id,
        });
        if (!this.rampService['client'].isSuccess(quoteRes) || !quoteRes.data) {
          await this.markContributionFailed(contribution.id, 'Ramp quote failed');
          return { success: false, error: `Ramp quote failed: ${this.rampService['client'].getError(quoteRes)}` };
        }
        rampQuoteToken = (quoteRes.data as any).quoteToken;
        if (!rampQuoteToken) {
          await this.markContributionFailed(contribution.id, 'Ramp quote returned no quoteToken');
          return { success: false, error: 'Ramp quote returned no quoteToken' };
        }

        const widgetRes = await this.rampService.createWidgetUrl({
          quoteToken: rampQuoteToken,
          walletAddress: deal.circleWalletAddress,
          walletChain: chain,
        });
        if (this.rampService['client'].isSuccess(widgetRes) && widgetRes.data) {
          rampWidgetUrl = (widgetRes.data as any).url;
          // orderId is assigned by Cleanverse when the widget payment completes;
          // it arrives via the ramp webhook or the next query_ramp_order call.
        }

        await prisma.contribution.update({
          where: { id: contribution.id },
          data: { rampQuoteToken },
        });

        logger.info(
          { contributionId: contribution.id, rampOrderId, rampQuoteToken, hasWidgetUrl: !!rampWidgetUrl },
          'Fiat ramp initiated — investor must complete payment in widget'
        );
      } else {
        // CRYPTO path: nothing to initiate — the investor sends USDC on-chain.
        // We return the deal wallet address so the frontend can show it.
        logger.info(
          { contributionId: contribution.id, dealWalletAddress: deal.circleWalletAddress, amount },
          'Crypto contribution recorded — awaiting investor on-chain transfer'
        );
      }

      // 6. VERIFY + MINT
      //    Synchronous mode: block until the deposit verifies, then mint.
      //    Async mode (default): return PENDING; background jobs verify + mint.
      let tokenAmount: string | undefined;
      let txHash: string | undefined;
      let rampTxHash: string | undefined;
      let contributionStatus: ContributionStatus = ContributionStatus.PENDING;

      if (mintTokensOnConfirm) {
        const pollResult = await this.depositVerificationService.pollUntilVerified(contribution.id, {
          maxAttempts: 60,
          intervalMs: 10000,
        });
        if (!pollResult.verified) {
          return {
            success: false,
            contributionId: contribution.id,
            contributionStatus: ContributionStatus.PENDING,
            error: pollResult.error || 'Deposit verification timed out',
            adminAddress,
          };
        }
        const minted = await this.mintTokensForContribution(contribution.id);
        tokenAmount = minted.tokenAmount;
        txHash = minted.txHash;
        rampTxHash = minted.rampTxHash;
        contributionStatus = ContributionStatus.CONFIRMED;
      } else {
        // Async: enqueue a background verification job. Lazy import avoids the
        // jobs <-> services module cycle.
        try {
          const { addJob } = await import('../../jobs/queue');
          const jobName =
            contributionType === ContributionType.FIAT ? 'poll-ramp-order' : 'verify-deposit';
          await addJob(jobName, { contributionId: contribution.id }, { attempts: 30 });
          logger.info({ contributionId: contribution.id, jobName }, 'Enqueued background deposit-verification job');
        } catch (jobError) {
          // If Redis/the queue is unavailable, fall back to a single inline check
          // so the contribution is not stranded.
          logger.warn({ error: jobError, contributionId: contribution.id }, 'Could not enqueue verification job — running inline check');
          const check =
            contributionType === ContributionType.FIAT
              ? await this.depositVerificationService.verifyFiatDeposit(contribution.id)
              : await this.depositVerificationService.verifyCryptoDeposit(contribution.id);
          if (check.verified) {
            const minted = await this.mintTokensForContribution(contribution.id);
            tokenAmount = minted.tokenAmount;
            txHash = minted.txHash;
            rampTxHash = minted.rampTxHash;
            contributionStatus = ContributionStatus.CONFIRMED;
          }
        }
      }

      return {
        success: true,
        contributionId: contribution.id,
        contributionStatus,
        tokenAmount,
        dealWalletAddress: deal.circleWalletAddress,
        txHash,
        rampOrderId,
        rampQuoteToken,
        rampWidgetUrl,
        rampTxHash,
        adminAddress,
      };
    } catch (error) {
      logger.error({ error, dealId }, 'Failed to process contribution');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to contribute',
      };
    }
  }

  /**
   * Mint POF A-Tokens for a CONFIRMED contribution and update deal totals.
   * Called by the contribute() synchronous path and by the background
   * verify-deposit job once a deposit is confirmed. Idempotent: if the
   * contribution is already CONFIRMED with tokens minted (totalSupply already
   * reflects it), this is a no-op.
   */
  async mintTokensForContribution(contributionId: string): Promise<{
    minted: boolean;
    tokenAmount?: string;
    txHash?: string;
    rampTxHash?: string;
    error?: string;
  }> {
    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      include: { deal: true, investor: true },
    });
    if (!contribution) return { minted: false, error: 'Contribution not found' };
    if (contribution.status !== ContributionStatus.CONFIRMED) {
      return { minted: false, error: `Contribution not confirmed (status: ${contribution.status})` };
    }

    const deal = contribution.deal;
    const tokenAmount = contribution.amount; // 1:1 ratio — 1 USDC = 1 POF token

    // Mint A-Tokens to the investor.
    if (deal.atokenAddress) {
      try {
        await this.aTokenService.mint({
          atokenAddress: deal.atokenAddress,
          address: contribution.investor.walletAddress,
          amount: tokenAmount,
        });
        logger.info(
          { contributionId, atokenAddress: deal.atokenAddress, investor: contribution.investor.walletAddress, tokenAmount },
          'A-Tokens minted to investor after verified deposit'
        );
      } catch (mintError) {
        logger.error({ error: mintError, contributionId }, 'Failed to mint A-Tokens');
        return { minted: false, error: 'A-Token mint failed' };
      }
    } else {
      logger.warn({ dealId: deal.id, contributionId }, 'No A-token address configured, skipping mint');
    }

    // Update deal running total + total supply.
    const newRunningTotal = parseFloat(deal.runningTotal.toString()) + parseFloat(tokenAmount);
    const newTotalSupply = parseFloat(deal.totalSupply.toString()) + parseFloat(tokenAmount);
    await prisma.deal.update({
      where: { id: deal.id },
      data: { runningTotal: newRunningTotal, totalSupply: newTotalSupply },
    });

    // Flip deal to FUNDED if target reached.
    if (newRunningTotal >= parseFloat(deal.targetAmount.toString())) {
      await prisma.deal.update({ where: { id: deal.id }, data: { status: 'FUNDED' } });
      logger.info({ dealId: deal.id }, 'Deal fully funded');
    }

    return {
      minted: true,
      tokenAmount,
      txHash: contribution.txHash || undefined,
      rampTxHash: contribution.rampTxHash || undefined,
    };
  }

  private async markContributionFailed(contributionId: string, reason: string) {
    await prisma.contribution.update({
      where: { id: contributionId },
      data: { status: ContributionStatus.FAILED },
    });
    logger.warn({ contributionId, reason }, 'Contribution marked FAILED');
  }

  /**
   * Get Deal by ID
   */
  async getDeal(dealId: string): Promise<DealWithDetails | null> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        purchaseOrder: {
          include: {
            buyer: { select: { walletAddress: true } },
            supplier: { select: { walletAddress: true } },
          },
        },
        contributions: {
          include: { investor: true },
        },
      },
    });

    if (!deal) return null;

    return {
      id: deal.id,
      purchaseOrderId: deal.purchaseOrderId,
      buyerAddress: deal.purchaseOrder?.buyer.walletAddress,
      supplierAddress: deal.purchaseOrder?.supplier.walletAddress,
      purchaseOrder: deal.purchaseOrder
        ? {
            poReference: deal.purchaseOrder.poReference,
            amount: deal.purchaseOrder.amount.toString(),
            currency: deal.purchaseOrder.currency,
            buyerAddress: deal.purchaseOrder.buyer?.walletAddress,
            supplierAddress: deal.purchaseOrder.supplier?.walletAddress,
            deliveryDate: deal.purchaseOrder.deliveryDate,
          }
        : undefined,
      chain: deal.chain,
      targetAmount: deal.targetAmount.toString(),
      runningTotal: deal.runningTotal.toString(),
      currency: deal.currency,
      fundingDeadline: deal.fundingDeadline,
      deliveryDeadline: deal.deliveryDeadline || deal.purchaseOrder?.deliveryDate || undefined,
      yieldPercent: deal.yieldPercent,
      status: deal.status,
      atokenSymbol: deal.atokenSymbol || undefined,
      atokenAddress: deal.atokenAddress || undefined,
      circleWalletId: deal.circleWalletId || undefined,
      circleWalletAddress: deal.circleWalletAddress || undefined,
      minInvestorTier: deal.minInvestorTier,
      eligibleCountries: deal.eligibleCountries,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      contributions: deal.contributions.map(c => ({
        id: c.id,
        investorAddress: c.investor.walletAddress,
        amount: c.amount.toString(),
        tokenAmount: '0', // Calculate based on contribution
        status: c.status,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Get investor's positions
   */
  async getInvestorPositions(walletAddress: string): Promise<InvestorPosition[]> {
    const investor = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (!investor) return [];

    const contributions = await prisma.contribution.findMany({
      where: { 
        investorId: investor.id,
        status: 'CONFIRMED',
      },
      include: { deal: true },
    });

    return contributions.map(c => {
      const deal = c.deal;
      const contributionAmount = parseFloat(c.amount.toString());
      const dealTarget = parseFloat(deal.targetAmount.toString());
      const proportion = contributionAmount / dealTarget;
      const expectedYield = contributionAmount * (deal.yieldPercent / 100);

      return {
        dealId: deal.id,
        dealSymbol: deal.atokenSymbol || `DEAL-${deal.id.substring(0, 6)}`,
        tokenAmount: '0', // Would calculate based on total supply
        principalUsdc: c.amount.toString(),
        expectedYield: expectedYield.toFixed(2),
        totalValue: (contributionAmount + expectedYield).toFixed(2),
        status: deal.status,
      };
    });
  }

  /**
   * Check eligibility for a deal
   */
  async checkEligibility(params: {
    walletAddress: string;
    dealId: string;
    chain: string;
  }): Promise<{ eligible: boolean; reason?: string }> {
    const { walletAddress, dealId, chain } = params;

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      return { eligible: false, reason: 'Deal not found' };
    }

    // Verify A-Pass
    const aPassVerification = await this.identityService.verifyAPass(walletAddress, chain);
    if (!aPassVerification.valid) {
      return { eligible: false, reason: `A-Pass verification failed: ${aPassVerification.reason}` };
    }

    // Check tier requirement
    if (deal.minInvestorTier && aPassVerification.tier !== undefined) {
      if (aPassVerification.tier < deal.minInvestorTier) {
        return { 
          eligible: false, 
          reason: `Tier ${aPassVerification.tier} below minimum ${deal.minInvestorTier}` 
        };
      }
    }

    // Check country eligibility
    if (deal.eligibleCountries.length > 0 && aPassVerification.countries) {
      const hasEligibleCountry = aPassVerification.countries.some(c => 
        deal.eligibleCountries.includes(c)
      );
      if (!hasEligibleCountry) {
        return { eligible: false, reason: 'Country not eligible for this deal' };
      }
    }

    return { eligible: true };
  }
}

let dealServiceInstance: DealService | null = null;

export function getDealService(): DealService {
  if (!dealServiceInstance) {
    dealServiceInstance = new DealService();
  }
  return dealServiceInstance;
}

export default getDealService;
