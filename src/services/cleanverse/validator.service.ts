import { getCleanverseClient, CleanverseClient } from './client';
import {
  ValidatorPoolRule,
  RegisterValidatorRequest,
  VerifyValidatorRequest,
  VerifyValidatorResponse,
  CleanverseResponse,
} from './types';
import { logger } from '../../config';

export class ValidatorService {
  private client: CleanverseClient;

  constructor() {
    this.client = getCleanverseClient();
  }

  /**
   * Grant validator registrar role
   * POST /validator/grant
   */
  async grantRegistrarRole(params: {
    chain: string;
    address: string;
    signature: string;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ chain: params.chain, address: params.address }, 'Granting validator registrar role');

    const response = await this.client.post<any>('/validator/grant', {
      chain: params.chain,
      address: params.address,
      signature: params.signature,
    });
    return response;
  }

  /**
   * Register validator compliance pool
   * POST /validator/register
   */
  async registerValidatorPool(params: {
    chain: string;
    name: string;
    ownerSignature: string;
  }): Promise<CleanverseResponse<any>> {
    const request: RegisterValidatorRequest = {
      chain: params.chain,
      name: params.name,
      owner_signature: params.ownerSignature,
    };

    logger.info({ chain: params.chain, name: params.name }, 'Registering validator pool');

    const response = await this.client.post<any>('/validator/register', request);
    return response;
  }

  /**
   * Set validator pool rules
   * POST /validator/set_rule
   */
  async setRules(params: {
    chain: string;
    rules: ValidatorPoolRule;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ chain: params.chain, rules: params.rules }, 'Setting validator pool rules');

    const response = await this.client.post<any>('/validator/set_rule', {
      chain: params.chain,
      rules: params.rules,
    });
    return response;
  }

  /**
   * Add rule to validator pool
   * POST /validator/add_rule
   */
  async addRule(params: {
    chain: string;
    rule: ValidatorPoolRule;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ chain: params.chain, rule: params.rule }, 'Adding validator pool rule');

    const response = await this.client.post<any>('/validator/add_rule', {
      chain: params.chain,
      ...params.rule,
    });
    return response;
  }

  /**
   * Remove rule from validator pool
   * POST /validator/remove_rule
   */
  async removeRule(params: {
    chain: string;
    ruleIndex: number;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ chain: params.chain, ruleIndex: params.ruleIndex }, 'Removing validator pool rule');

    const response = await this.client.post<any>('/validator/remove_rule', {
      chain: params.chain,
      rule_index: params.ruleIndex,
    });
    return response;
  }

  /**
   * Set validator pool pause state
   * POST /validator/set_paused
   */
  async setPaused(params: {
    chain: string;
    paused: boolean;
  }): Promise<CleanverseResponse<any>> {
    logger.info({ chain: params.chain, paused: params.paused }, 'Setting validator pool pause state');

    const response = await this.client.post<any>('/validator/set_paused', {
      chain: params.chain,
      paused: params.paused,
    });
    return response;
  }

  /**
   * Check if validator is registered
   * POST /validator/is_register
   */
  async isRegistered(chain: string): Promise<CleanverseResponse<any>> {
    const response = await this.client.post<any>('/validator/is_register', {
      chain,
    });

    logger.info({ chain, registered: response.data?.registered }, 'Checking validator registration');

    return response;
  }

  /**
   * Get validator pool rules
   * POST /validator/rules
   */
  async getRules(chain: string): Promise<CleanverseResponse<any>> {
    const response = await this.client.post<any>('/validator/rules', {
      chain,
    });

    logger.info({ chain, rulesCount: response.data?.rules?.length }, 'Getting validator pool rules');

    return response;
  }

  /**
   * Verify user against validator pool
   * POST /validator/verify
   */
  async verify(params: VerifyValidatorRequest): Promise<CleanverseResponse<VerifyValidatorResponse>> {
    logger.info({ 
      chain: params.chain, 
      address: params.address 
    }, 'Verifying against validator pool');

    const response = await this.client.post<VerifyValidatorResponse>('/validator/verify', params);
    return response;
  }

  /**
   * Check if validator pool is paused
   * POST /validator/is_paused
   */
  async isPaused(chain: string): Promise<CleanverseResponse<any>> {
    const response = await this.client.post<any>('/validator/is_paused', {
      chain,
    });

    logger.info({ chain, paused: response.data?.paused }, 'Checking validator pause state');

    return response;
  }
}

// Singleton instance
let validatorServiceInstance: ValidatorService | null = null;

export function getValidatorService(): ValidatorService {
  if (!validatorServiceInstance) {
    validatorServiceInstance = new ValidatorService();
  }
  return validatorServiceInstance;
}

export default getValidatorService;
