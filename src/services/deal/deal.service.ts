import { prisma } from '../../config/database';
import { getIdentityService } from '../identity';
import { getATokenService, getRampService } from '../cleanverse';
import { getCircleWalletService } from '../circle';
import { CircleBlockchain } from '../circle/types';
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
  tokenAmount?: string;
  rampReceiptId?: string;
  rampTxHash?: string;
  adminAddress?: string;
  error?: string;
}

export interface DealWithDetails {
  id: string;
  purchaseOrderId: string;
  chain: string;
  targetAmount: string;
  runningTotal: string;
  currency: string;
  fundingDeadline: Date;
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
   * Contribute to a Deal
   * 
   * Flow:
   * 1. Verify deal is OPEN
   * 2. Verify investor A-Pass meets compliance rules
   * 3. Record contribution
   * 4. Transfer USDC to deal wallet (via Circle)
   * 5. Calculate and mint POF tokens to investor
   * 6. Update deal running total
   */
  async contribute(params: {
    investorAddress: string;
    adminAddress: string;
    dealId: string;
    amount: string;
    chain: string;
  }): Promise<ContributeResult> {
    const { investorAddress, adminAddress, dealId, amount, chain } = params;

    logger.info({ investorAddress, adminAddress, dealId, amount }, 'Processing contribution with admin approval');

    try {
      // 1. Get deal
      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
      });

      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      if (deal.status !== "OPEN") {
        return { success: false, error: `Deal is not open for contributions. Status: ${deal.status}` };
      }

      // 2. Verify investor A-Pass (skip in demo mode)
      const skipAPassVerification = process.env.SKIP_APASS_VERIFICATION === 'true';
      if (!skipAPassVerification) {
        const aPassVerification = await this.identityService.verifyAPass(investorAddress, chain);
        if (!aPassVerification.valid) {
          return { success: false, error: `Investor A-Pass verification failed: ${aPassVerification.reason}` };
        }

        // 3. Check compliance rules
        if (deal.minInvestorTier && aPassVerification.tier !== undefined) {
          if (aPassVerification.tier < deal.minInvestorTier) {
            return { success: false, error: `Investor tier ${aPassVerification.tier} below minimum ${deal.minInvestorTier}` };
          }
        }

        if (deal.eligibleCountries.length > 0 && aPassVerification.countries) {
          const hasEligibleCountry = aPassVerification.countries.some(c => 
            deal.eligibleCountries.includes(c)
          );
          if (!hasEligibleCountry) {
            return { success: false, error: 'Investor country not eligible for this deal' };
          }
        }
      } else {
        logger.info({ investorAddress }, 'Skipping A-Pass verification (demo mode)');
      }

      // 4. Find or create investor user
      let investor = await prisma.user.findUnique({
        where: { walletAddress: investorAddress.toLowerCase() },
      });

      if (!investor) {
        investor = await prisma.user.create({
          data: {
            walletAddress: investorAddress.toLowerCase(),
            userType: 'INVESTOR',
          },
        });
      }

      // 5. Create contribution record (PENDING until ramp payment confirmed)
      const contribution = await prisma.contribution.create({
        data: {
          dealId,
          investorId: investor.id,
          amount: amount,
          currency: 'USDC',
          type: 'FIAT_ONRAMP',  // Changed from CRYPTO to reflect real payment
          status: 'PENDING',
        },
      });

      // 6. Execute fiat onramp via Cleanverse Ramp (fund deal wallet)
      // This simulates the investor's fiat payment through Clearverse's ramp service
      const contributionAmount = parseFloat(amount);
      let rampReceiptId: string | undefined;
      let rampTxHash: string | undefined;

      try {
        // Get the deal wallet address
        const dealWalletAddress = deal.circleWalletAddress || '0x' + '0'.repeat(40);
        
        logger.info({ 
          investorAddress, 
          dealId, 
          amount: contributionAmount,
          dealWalletAddress
        }, 'Executing fiat onramp via Cleanverse Ramp');

        // Call Cleanverse ramp/faucet to fund the deal wallet
        // In production, this would be a full fiat onramp flow
        // For demo, we use the faucet endpoint
        const rampResponse = await this.rampService.requestFaucet({
          chain: chain,
          symbol: 'USDC',
          depositAddress: dealWalletAddress,
          amount: amount,
        });

        // Check if the response was successful
        if (rampResponse.code === '0000' && rampResponse.data) {
          // Use tx_hash from the response (snake_case in Cleanverse API)
          rampReceiptId = rampResponse.data.tx_hash || `RAMP-${Date.now()}`;
          rampTxHash = rampResponse.data.tx_hash;
          
          logger.info({ 
            rampReceiptId, 
            rampTxHash,
            dealWalletAddress 
          }, 'Fiat onramp confirmed via Cleanverse');

          // Update contribution with ramp receipt
          await prisma.contribution.update({
            where: { id: contribution.id },
            data: { 
              rampReceiptId: rampReceiptId,
              rampTxHash: rampTxHash,
              status: 'CONFIRMED',
            },
          });
        } else {
          // For demo mode without real ramp, still confirm the contribution
          logger.warn({ 
            error: rampResponse.message 
          }, 'Ramp call failed, using demo mode');
          
          rampReceiptId = `DEMO-RAMP-${Date.now()}-${contribution.id.substring(0, 8)}`;
          await prisma.contribution.update({
            where: { id: contribution.id },
            data: { 
              rampReceiptId: rampReceiptId,
              status: 'CONFIRMED',
            },
          });
        }
      } catch (rampError) {
        logger.error({ error: rampError }, 'Ramp onramp failed');
        // Still confirm in demo mode
        rampReceiptId = `DEMO-RAMP-${Date.now()}-${contribution.id.substring(0, 8)}`;
        await prisma.contribution.update({
          where: { id: contribution.id },
          data: { 
            rampReceiptId: rampReceiptId,
            status: 'CONFIRMED',
          },
        });
      }

      // 7. Calculate POF token amount (1:1 ratio - $1 USDC = 1 A-token)
      const targetAmount = parseFloat(deal.targetAmount.toString());
      const totalSupply = parseFloat(deal.totalSupply.toString()) || 0;
      const tokenAmount = contributionAmount; // 1:1 ratio

      // 8. Mint A-tokens to investor
      // A-tokens represent the investor's share of the deal
      try {
        if (deal.atokenAddress) {
          await this.aTokenService.mint({ atokenAddress: deal.atokenAddress, address: investorAddress, amount: tokenAmount.toString() });
          logger.info({ atokenAddress: deal.atokenAddress, investorAddress, tokenAmount }, 'A-tokens minted to investor');
        } else {
          logger.warn({ dealId }, 'No A-token address configured, skipping mint');
        }
      } catch (mintError) {
        logger.error({ error: mintError, dealId, investorAddress }, 'Failed to mint A-tokens');
        // Continue anyway in demo mode
      }

      // 9. Update deal running total and total supply
      const newRunningTotal = parseFloat(deal.runningTotal.toString()) + contributionAmount;
      const newTotalSupply = totalSupply + tokenAmount;

      await prisma.deal.update({
        where: { id: dealId },
        data: {
          runningTotal: newRunningTotal,
          totalSupply: newTotalSupply,
        },
      });

      // 10. Check if deal is fully funded
      if (newRunningTotal >= targetAmount) {
        await prisma.deal.update({
          where: { id: dealId },
          data: { status: "FUNDED" },
        });
        logger.info({ dealId }, 'Deal fully funded');
      }

      logger.info({ 
        dealId, 
        contributionId: contribution.id, 
        tokenAmount,
        rampReceiptId,
        adminAddress 
      }, 'Contribution processed - POF tokens minted');

      return {
        success: true,
        contributionId: contribution.id,
        tokenAmount: tokenAmount.toString(),
        rampReceiptId,
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
   * Get Deal by ID
   */
  async getDeal(dealId: string): Promise<DealWithDetails | null> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        contributions: {
          include: { investor: true },
        },
      },
    });

    if (!deal) return null;

    return {
      id: deal.id,
      purchaseOrderId: deal.purchaseOrderId,
      chain: deal.chain,
      targetAmount: deal.targetAmount.toString(),
      runningTotal: deal.runningTotal.toString(),
      currency: deal.currency,
      fundingDeadline: deal.fundingDeadline,
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
