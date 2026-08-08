import { getAPassService, CleanverseClient } from '../cleanverse';
import { prisma } from '../../config/database';
import { logger } from '../../config';
import { UserType } from '@prisma/client';

export interface OnboardResult {
  success: boolean;
  apassId?: string;
  apassAddress?: string;
  status?: string;
  error?: string;
}

export interface IdentityStatus {
  registered: boolean;
  apassId?: string;
  status?: string;
  tier?: number;
  countries?: string[];
  expirationTime?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  apassId?: string;
  tier?: number;
  countries?: string[];
}

export class IdentityService {
  private aPassService = getAPassService();

  /**
   * Onboard a user - create A-Pass for their wallet
   * This registers the user's wallet address with Cleanverse for KYC
   */
  async onboard(params: {
    walletAddress: string;
    chain: string;
    userType: UserType;
    customerId: string;
    identityDataList?: Array<{
      idType: 'ID_CARD' | 'PASSPORT' | 'DRIVER_LICENSE' | 'RESIDENCE_PERMIT';
      fullName: string; // Required by Cleanverse!
      issuingCountryISO2: string;
    }>;
  }): Promise<OnboardResult> {
    const { walletAddress, chain, userType, customerId, identityDataList } = params;

    logger.info({ walletAddress, userType, customerId }, 'Onboarding user');

    try {
      // Call Cleanverse API to generate A-Pass
      const response = await this.aPassService.generateAPass({
        chain,
        walletAddress,
        customerId,
        identityDataList,
      });

      if (response.code !== '0000') {
        return {
          success: false,
          error: response.message,
        };
      }

      const apassData = response.data;

      // Map Cleanverse response to our format
      const apassId = apassData.cvRecordId;
      const apassAddress = apassData.wallet?.apassAddress || apassData.apassAddress;
      const apassTxHash = apassData.wallet?.txHash;
      const apassTier = apassData.tier;
      const apassCountries = apassData.countries || [];
      // Status will be updated via webhook or query_apass
      // For now, set to PENDING until webhook confirms activation
      const apassStatus = 'PENDING';

      // Store/update user in database
      await prisma.user.upsert({
        where: { walletAddress: walletAddress.toLowerCase() },
        update: {
          walletAddress: walletAddress.toLowerCase(),
          chain,
          userType,
          customerId,
          apassId: apassId,
          apassStatus: apassStatus,
          apassTier: apassTier ? parseInt(apassTier) : null,
          apassCountries: apassCountries,
          apassTxHash: apassTxHash,
          apassAddress: apassAddress,
        },
        create: {
          walletAddress: walletAddress.toLowerCase(),
          chain,
          userType,
          customerId,
          apassId: apassId,
          apassStatus: apassStatus,
          apassTier: apassTier ? parseInt(apassTier) : null,
          apassCountries: apassCountries,
          apassTxHash: apassTxHash,
          apassAddress: apassAddress,
        },
      });

      return {
        success: true,
        apassId: apassId,
        apassAddress: apassAddress,
        status: apassStatus,
      };
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to onboard user');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get identity status for a wallet address
   */
  async getStatus(walletAddress: string): Promise<IdentityStatus> {
    logger.info({ walletAddress }, 'Getting identity status');

    // First check database
    const user = await prisma.user.findUnique({
      where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (!user) {
      return { registered: false };
    }

    // Query Cleanverse for latest status
    try {
      const response = await this.aPassService.queryAPass({
        chain: user.chain || 'polygon',
        walletAddress: user.walletAddress,
      });

      if (response.code === '0000' && response.data) {
        const apassData = response.data;

        // Update database with latest status
        await prisma.user.update({
          where: { id: user.id },
          data: {
            apassStatus: apassData.status as string,
            apassTier: apassData.tier ? parseInt(apassData.tier) : null,
            apassCountries: apassData.countries,
            apassExpiration: apassData.expirationTime ? new Date(apassData.expirationTime * 1000) : null,
          },
        });

        return {
          registered: true,
          apassId: apassData.apassId,
          status: apassData.status as string,
          tier: apassData.tier ? parseInt(apassData.tier) : undefined,
          countries: apassData.countries,
          expirationTime: apassData.expirationTime,
        };
      }
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to query Cleanverse');
    }

    // Return database state
    return {
      registered: true,
      apassId: user.apassId || undefined,
      status: user.apassStatus,
      tier: user.apassTier || undefined,
      countries: user.apassCountries || undefined,
      expirationTime: user.apassExpiration 
        ? Math.floor(user.apassExpiration.getTime() / 1000) 
        : undefined,
    };
  }

  /**
   * Verify A-Pass for a wallet (for gating)
   * Returns true if wallet has valid, active A-Pass
   */
  async verifyAPass(walletAddress: string, chain: string = 'monad'): Promise<{
    valid: boolean;
    reason?: string;
    tier?: number;
    countries?: string[];
  }> {
    logger.info({ walletAddress, chain }, 'Verifying A-Pass');

    try {
      // Use queryAPass to check if user has a valid A-Pass
      // verifyAPass requires an A-Token address which we don't have during PO creation
      const response = await this.aPassService.queryAPass({
        chain,
        walletAddress,
      });

      if (response.code !== '0000') {
        return { valid: false, reason: response.message };
      }

      const data = response.data;

      // status can be numeric (1=active, 2=frozen) or string ('ACTIVE', 'FROZEN')
      // Numeric 1 or string 'ACTIVE' means valid
      const status = data?.status;
      const isActive = status == 1 || status === 'ACTIVE' || status === 'PENDING';
      
      if (!data || !isActive) {
        return { valid: false, reason: 'A-Pass not valid or not registered' };
      }

      return {
        valid: true,
        tier: data.tier ? parseInt(data.tier) : undefined,
        countries: data.countries,
      };
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to verify A-Pass');
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Check investment eligibility for a deal
   * Verifies A-Pass and checks against deal's compliance rules
   */
  async checkDealEligibility(params: {
    walletAddress: string;
    dealId: string;
  }): Promise<EligibilityResult> {
    const { walletAddress, dealId } = params;

    logger.info({ walletAddress, dealId }, 'Checking deal eligibility');

    // Get deal to find compliance requirements
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { purchaseOrder: true },
    });

    if (!deal) {
      return { eligible: false, reason: 'Deal not found' };
    }

    // Verify A-Pass first
    const aPassVerification = await this.verifyAPass(walletAddress, deal.chain);

    if (!aPassVerification.valid) {
      return {
        eligible: false,
        reason: aPassVerification.reason || 'A-Pass verification failed',
      };
    }

    // TODO: Check A-Token compliance rules
    // This would require:
    // 1. Get the A-Token for this deal
    // 2. Query A-Token rules from Cleanverse
    // 3. Verify wallet meets the rules (tier, countries, etc.)

    // For now, just verify A-Pass
    return {
      eligible: true,
      apassId: aPassVerification.tier ? undefined : undefined,
      tier: aPassVerification.tier,
      countries: aPassVerification.countries,
    };
  }

  /**
   * Freeze A-Pass (for compliance violations or defaults)
   */
  async freeze(walletAddress: string, chain: string, reason: string): Promise<boolean> {
    logger.info({ walletAddress, reason }, 'Freezing A-Pass');

    try {
      const response = await this.aPassService.freeze({
        chain,
        walletAddress,
        reason,
      });

      if (response.code === '0000') {
        // Update database
        await prisma.user.update({
          where: { walletAddress: walletAddress.toLowerCase() },
          data: { apassStatus: 'FROZEN' },
        });
        return true;
      }

      logger.error({ response }, 'Failed to freeze A-Pass');
      return false;
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to freeze A-Pass');
      return false;
    }
  }

  /**
   * Unfreeze A-Pass (after compliance resolved)
   */
  async unfreeze(walletAddress: string, chain: string): Promise<boolean> {
    logger.info({ walletAddress }, 'Unfreezing A-Pass');

    try {
      const response = await this.aPassService.unfreeze({
        chain,
        walletAddress,
      });

      if (response.code === '0000') {
        // Update database
        await prisma.user.update({
          where: { walletAddress: walletAddress.toLowerCase() },
          data: { apassStatus: 'ACTIVE' },
        });
        return true;
      }

      logger.error({ response }, 'Failed to unfreeze A-Pass');
      return false;
    } catch (error) {
      logger.error({ error, walletAddress }, 'Failed to unfreeze A-Pass');
      return false;
    }
  }

  /**
   * Batch verify multiple wallets
   */
  async batchVerify(wallets: string[], chain: string = 'polygon'): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.all(
      wallets.map(async (wallet) => {
        const result = await this.verifyAPass(wallet, chain);
        results.set(wallet, result.valid);
      })
    );

    return results;
  }
}

// Singleton instance
let identityServiceInstance: IdentityService | null = null;

export function getIdentityService(): IdentityService {
  if (!identityServiceInstance) {
    identityServiceInstance = new IdentityService();
  }
  return identityServiceInstance;
}

export default getIdentityService;
