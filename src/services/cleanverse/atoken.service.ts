import { getCleanverseClient, CleanverseClient } from './client';
import {
  LaunchATokenRequest,
  ATokenApplication,
  ATokenInfo,
  ATokenRule,
  CleanverseResponse,
  AddRuleRequest,
  SetPausedRequest,
  InstitutionalWhitelistRequest,
} from './types';
import { logger } from '../../config';

export class ATokenService {
  private client: CleanverseClient;

  constructor() {
    this.client = getCleanverseClient();
  }

  /**
   * Check if response is successful
   */
  isSuccess(response: CleanverseResponse<any>): boolean {
    return response.code === '0000';
  }

  /**
   * Get error message from response
   */
  getError(response: CleanverseResponse<any>): string {
    return response.message || 'Unknown error';
  }

  /**
   * Launch a new A-Token
   * POST /atoken/launch
   */
  async launch(params: {
    chain: string;
    tokenName: string;
    tokenSymbol: string;
    adminAddress: string;
    rule: ATokenRule;
    icon?: string;
    callbackUrl?: string;
    decimals?: number;
  }): Promise<CleanverseResponse<ATokenApplication>> {
    const request: LaunchATokenRequest = {
      chain: params.chain,
      token_name: params.tokenName,
      token_symbol: params.tokenSymbol,
      decimals: params.decimals || 6,
      admin_address: params.adminAddress,
      rule: params.rule,
      icon: params.icon,
      callback_url: params.callbackUrl,
    };

    logger.info({ 
      tokenName: params.tokenName,
      tokenSymbol: params.tokenSymbol,
      chain: params.chain 
    }, 'Launching A-Token');

    const response = await this.client.post<ATokenApplication>('/atoken/launch', request);
    return response;
  }

  /**
   * Query A-Token application status
   * GET /atoken/query_apply_status/{requestId}
   */
  async queryApplyStatus(requestId: string): Promise<CleanverseResponse<ATokenApplication>> {
    const response = await this.client.get<ATokenApplication>(
      `/atoken/query_apply_status/${requestId}`
    );

    logger.info({ 
      requestId,
      status: response.data?.applyStatus 
    }, 'Query A-Token application status');

    return response;
  }

  /**
   * Poll for A-Token issuance
   */
  async pollForIssuance(
    requestId: string,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<CleanverseResponse<ATokenApplication>> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.queryApplyStatus(requestId);
      
      if (this.client.isSuccess(response)) {
        const status = response.data?.applyStatus;
        
        if (status === 'ISSUED') {
          logger.info({ requestId }, 'A-Token issued successfully');
          return response;
        }
        
        if (status === 'REJECTED') {
          logger.warn({ requestId }, 'A-Token application rejected');
          return response;
        }
        
        logger.debug({ requestId, status, attempt: i + 1 }, 'Waiting for A-Token issuance...');
        await this.delay(intervalMs);
      } else {
        throw new Error(`Failed to query A-Token status: ${this.client.getError(response)}`);
      }
    }
    
    throw new Error(`A-Token issuance timeout after ${maxAttempts} attempts`);
  }

  /**
   * Register an existing A-Token
   * POST /atoken/register_atoken
   */
  async registerAToken(params: {
    chain: string;
    atokenAddress: string;
    ownerSignature: string;
    atokenIcon: string;
    callbackUrl?: string;
  }): Promise<CleanverseResponse<ATokenApplication>> {
    const response = await this.client.post<ATokenApplication>('/atoken/register_atoken', {
      chain: params.chain,
      atoken_address: params.atokenAddress,
      owner_signature: params.ownerSignature,
      atoken_icon: params.atokenIcon,
      callback_url: params.callbackUrl,
    });

    logger.info({ atokenAddress: params.atokenAddress }, 'Registering A-Token');
    return response;
  }

  /**
   * Add compliance rule to A-Token
   * POST /atoken/add_rule
   */
  async addRule(params: {
    chain: string;
    atokenAddress: string;
    rule: ATokenRule;
  }): Promise<CleanverseResponse<any>> {
    const request: AddRuleRequest = {
      chain: params.chain,
      atoken_address: params.atokenAddress,
      rule: params.rule,
    };

    logger.info({ 
      atokenAddress: params.atokenAddress,
      rule: params.rule 
    }, 'Adding A-Token rule');

    const response = await this.client.post<any>('/atoken/add_rule', request);
    return response;
  }

  /**
   * Remove compliance rule from A-Token
   * POST /atoken/remove_rule
   */
  async removeRule(params: {
    chain: string;
    atokenAddress: string;
    ruleIndex: number;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ 
      atokenAddress: params.atokenAddress,
      ruleIndex: params.ruleIndex 
    }, 'Removing A-Token rule');

    const response = await this.client.post<any>('/atoken/remove_rule', {
      chain: params.chain,
      atoken_address: params.atokenAddress,
      rule_index: params.ruleIndex,
    });
    return response;
  }

  /**
   * Get A-Token rules
   * POST /atoken/rules
   */
  async getRules(params: {
    chain: string;
    atokenAddress: string;
  }): Promise<CleanverseResponse<any>> {
    const response = await this.client.post<any>('/atoken/rules', {
      chain: params.chain,
      atoken_address: params.atokenAddress,
    });

    logger.info({ 
      atokenAddress: params.atokenAddress,
      rulesCount: response.data?.rules?.length 
    }, 'Get A-Token rules');

    return response;
  }

  /**
   * Set A-Token paused state
   * POST /atoken/set_paused
   */
  async setPaused(params: {
    chain: string;
    atokenAddress: string;
    paused: boolean;
  }): Promise<CleanverseResponse<any>> {
    const request: SetPausedRequest = {
      chain: params.chain,
      atoken_address: params.atokenAddress,
      paused: params.paused,
    };

    logger.info({ 
      atokenAddress: params.atokenAddress,
      paused: params.paused 
    }, 'Setting A-Token paused state');

    const response = await this.client.post<any>('/atoken/set_paused', request);
    return response;
  }

  /**
   * Add institutional deposit whitelist
   * POST /atoken/add_whitelist_for_institutional
   */
  async addWhitelist(params: {
    chain: string;
    atokenAddress: string;
    address: string;
  }): Promise<CleanverseResponse<any>> {
    const request: InstitutionalWhitelistRequest = {
      chain: params.chain,
      atoken_address: params.atokenAddress,
      address: params.address,
    };

    logger.info({ 
      atokenAddress: params.atokenAddress,
      address: params.address 
    }, 'Adding institutional whitelist');

    const response = await this.client.post<any>('/atoken/add_whitelist_for_institutional', request);
    return response;
  }

  /**
   * Remove institutional deposit whitelist
   * POST /atoken/remove_whitelist_for_institutional
   */
  async removeWhitelist(params: {
    chain: string;
    atokenAddress: string;
    address: string;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ 
      atokenAddress: params.atokenAddress,
      address: params.address 
    }, 'Removing institutional whitelist');

    const response = await this.client.post<any>('/atoken/remove_whitelist_for_institutional', {
      chain: params.chain,
      atoken_address: params.atokenAddress,
      address: params.address,
    });
    return response;
  }

  /**
   * List all A-Tokens owned by this institution
   * GET /atoken/list_my_atokens
   */
  async listMyATokens(): Promise<CleanverseResponse<{
    list: ATokenInfo[];
  }>> {
    const response = await this.client.get<{
      list: ATokenInfo[];
    }>('/atoken/list_my_atokens');

    logger.info({ 
      count: response.data?.list?.length 
    }, 'Listing A-Tokens');

    return response;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Burn A-Tokens (redeem)
   * POST /atoken/redeem
   * 
   * Investors burn their A-tokens to claim their USDC payout.
   */
  async burn(params: {
    atokenAddress: string;
    address: string;
    amount: string;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ 
      atokenAddress: params.atokenAddress,
      address: params.address,
      amount: params.amount 
    }, 'Burning A-Tokens');

    // Call the redeem endpoint
    const response = await this.client.post<any>('/atoken/redeem', {
      atoken_address: params.atokenAddress,
      address: params.address,
      amount: params.amount,
    });

    if (this.isSuccess(response)) {
      logger.info({ 
        txHash: response.data?.tx_hash,
        burnedAmount: response.data?.burned_amount 
      }, 'A-Tokens burned successfully');
    }

    return response;
  }

  /**
   * Mint A-Tokens to an address
   * POST /atoken/mint
   */
  async mint(params: {
    atokenAddress: string;
    address: string;
    amount: string;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ 
      atokenAddress: params.atokenAddress,
      address: params.address,
      amount: params.amount 
    }, 'Minting A-Tokens');

    const response = await this.client.post<any>('/atoken/mint', {
      atoken_address: params.atokenAddress,
      address: params.address,
      amount: params.amount,
    });

    if (this.isSuccess(response)) {
      logger.info({ 
        txHash: response.data?.tx_hash,
        mintedAmount: response.data?.minted_amount 
      }, 'A-Tokens minted successfully');
    }

    return response;
  }
}

// Singleton instance
let aTokenServiceInstance: ATokenService | null = null;

export function getATokenService(): ATokenService {
  if (!aTokenServiceInstance) {
    aTokenServiceInstance = new ATokenService();
  }
  return aTokenServiceInstance;
}

export default getATokenService;
