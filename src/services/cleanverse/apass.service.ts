import { getCleanverseClient, CleanverseClient } from './client';
import {
  GenerateAPassRequest,
  APassInfo,
  UpdateStatusRequest,
  CleanverseResponse,
} from './types';
import { logger } from '../../config';
import { prisma } from '../../config/database';

export class AService {
  private client: CleanverseClient;

  constructor() {
    this.client = getCleanverseClient();
  }

  /**
   * Generate a new A-Pass for a user
   * POST /generate_apass
   */
  async generateAPass(params: {
    chain: string;
    walletAddress: string;
    customerId: string;
    identityDataList?: GenerateAPassRequest['identityDataList'];
    subGroup?: string;
    subTier?: number;
    expirationTime?: number; // Unix timestamp, defaults to 2029-01-21
  }): Promise<CleanverseResponse<APassInfo>> {
    // Default expiration: 2029-01-21 00:00:00 UTC
    const defaultExpiration = 1863690034;
    
    const request: GenerateAPassRequest = {
      customerId: params.customerId,
      wallet: {
        address: params.walletAddress,
        chain: params.chain,
      },
      expirationTime: params.expirationTime || defaultExpiration,
      identityDataList: params.identityDataList,
      subGroup: params.subGroup,
      subTier: params.subTier,
    };

    logger.info({ walletAddress: params.walletAddress }, 'Generating A-Pass');

    const response = await this.client.post<APassInfo>('/generate_apass', request);
    return response;
  }

  /**
   * Query A-Pass information by wallet address
   * POST /query_apass - Plain JSON (no encryption)
   */
  async queryAPass(params: {
    chain: string;
    walletAddress: string;
  }): Promise<CleanverseResponse<APassInfo>> {
    // query_apass uses plain JSON, not encrypted
    const response = await this.client.post<APassInfo>('/query_apass', {
      chain: params.chain,
      address: params.walletAddress,
    }, false); // false = don't encrypt

    logger.info({ 
      walletAddress: params.walletAddress,
      status: response.data?.status 
    }, 'Query A-Pass');

    return response;
  }

  /**
   * Query all A-Pass registrations for this institution
   * POST /query_apass_list
   */
  async queryAPassList(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<CleanverseResponse<{
    list: APassInfo[];
    total: number;
    page: number;
    pageSize: number;
  }>> {
    const response = await this.client.post('/query_apass_list', {
      page: params?.page || 1,
      pageSize: params?.pageSize || 20,
    });

    return response as CleanverseResponse<any>;
  }

  /**
   * Verify A-Pass eligibility (for investor gating)
   * POST /verify_apass
   */
  async verifyAPass(params: {
    chain: string;
    walletAddress: string;
  }): Promise<CleanverseResponse<{
    valid: boolean;
    apassId?: string;
    tier?: number;
    countries?: string[];
  }>> {
    const response = await this.client.post<{
      valid: boolean;
      apassId?: string;
      tier?: number;
      countries?: string[];
    }>('/verify_apass', {
      chain: params.chain,
      address: params.walletAddress,
    });

    logger.info({ 
      walletAddress: params.walletAddress,
      valid: response.data?.valid 
    }, 'Verify A-Pass');

    return response;
  }

  /**
   * Update A-Pass status (freeze/unfreeze)
   * POST /update_status
   */
  async updateStatus(params: {
    chain: string;
    walletAddress: string;
    action: 'freeze' | 'unfreeze';
    reason?: string;
  }): Promise<CleanverseResponse<any>> {
    const request: UpdateStatusRequest = {
      chain: params.chain,
      address: params.walletAddress,
      status: params.action === 'freeze' ? '2' : '1',
      blacklistReason: params.reason,
    };

    logger.info({ 
      walletAddress: params.walletAddress,
      action: params.action,
      reason: params.reason 
    }, 'Updating A-Pass status');

    const response = await this.client.post<any>('/update_status', request);
    return response;
  }

  /**
   * Freeze A-Pass (on default)
   */
  async freeze(params: {
    chain: string;
    walletAddress: string;
    reason: string;
  }): Promise<CleanverseResponse<any>> {
    return this.updateStatus({
      ...params,
      action: 'freeze',
    });
  }

  /**
   * Unfreeze A-Pass
   */
  async unfreeze(params: {
    chain: string;
    walletAddress: string;
  }): Promise<CleanverseResponse<any>> {
    return this.updateStatus({
      ...params,
      action: 'unfreeze',
    });
  }

  /**
   * Get deposit address for a wallet
   * POST /query_deposit_address
   */
  async queryDepositAddress(params: {
    chain: string;
    walletAddress: string;
  }): Promise<CleanverseResponse<any>> {
    const response = await this.client.post<any>('/query_deposit_address', {
      chain: params.chain,
      address: params.walletAddress,
    });

    logger.info({ 
      walletAddress: params.walletAddress,
      depositAddress: response.data?.address 
    }, 'Query deposit address');

    return response;
  }

  /**
   * Check if user is eligible to invest based on A-Pass
   */
  async checkInvestmentEligibility(params: {
    chain: string;
    walletAddress: string;
    minTier?: number;
    eligibleCountries?: string[];
  }): Promise<{
    eligible: boolean;
    reason?: string;
    apassId?: string;
    tier?: number;
    countries?: string[];
  }> {
    // First verify A-Pass exists and is valid
    const verifyResult = await this.verifyAPass({
      chain: params.chain,
      walletAddress: params.walletAddress,
    });

    if (!this.client.isSuccess(verifyResult) || !verifyResult.data?.valid) {
      return {
        eligible: false,
        reason: 'A-Pass not valid or not registered',
      };
    }

    const { apassId, tier, countries } = verifyResult.data;

    // Check tier requirement
    if (params.minTier && tier !== undefined && tier < params.minTier) {
      return {
        eligible: false,
        reason: `Tier ${tier} below minimum required tier ${params.minTier}`,
        apassId,
        tier,
        countries,
      };
    }

    // Check country eligibility
    if (params.eligibleCountries && params.eligibleCountries.length > 0) {
      const hasEligibleCountry = countries?.some(country => 
        params.eligibleCountries!.includes(country)
      );
      if (!hasEligibleCountry) {
        return {
          eligible: false,
          reason: `Country not in eligible list: ${countries?.join(', ')}`,
          apassId,
          tier,
          countries,
        };
      }
    }

    return {
      eligible: true,
      apassId,
      tier,
      countries,
    };
  }
}

// Singleton instance
let aPassServiceInstance: AService | null = null;

export function getAPassService(): AService {
  if (!aPassServiceInstance) {
    aPassServiceInstance = new AService();
  }
  return aPassServiceInstance;
}

export default getAPassService;
