import { getCleanverseClient, CleanverseClient } from './client';
import {
  TransactionRequest,
  Transaction,
  InstitutionTransactionRequest,
  InstitutionTransaction,
  DownloadTravelRuleRequest,
  TravelRuleDownload,
  FaucetRequest,
  FaucetResponse,
  CleanverseResponse,
} from './types';
import { logger } from '../../config';

export class AuditService {
  private client: CleanverseClient;

  constructor() {
    this.client = getCleanverseClient();
  }

  /**
   * Query transactions for a wallet
   * POST /query_txs
   */
  async queryTransactions(params?: TransactionRequest): Promise<CleanverseResponse<{
    txs: Transaction[];
    total: number;
    page: number;
    pageSize: number;
  }>> {
    logger.info({ params }, 'Querying transactions');

    const response = await this.client.post('/query_txs', {
      chain: params?.chain,
      address: params?.address,
      startTime: params?.startTime,
      endTime: params?.endTime,
      txHash: params?.txHash,
      type: params?.type,
      page: params?.page || 1,
      pageSize: params?.pageSize || 20,
    });

    return response as CleanverseResponse<any>;
  }

  /**
   * Query institution transactions (deposits/withdraws)
   * POST /query_institution_txs
   */
  async queryInstitutionTransactions(params: {
    chain: string;
    type: 'deposit' | 'withdraw';
    startTime?: number;
    endTime?: number;
    page?: number;
    pageSize?: number;
  }): Promise<CleanverseResponse<{
    txs: InstitutionTransaction[];
    total: number;
    page: number;
    pageSize: number;
  }>> {
    const request: InstitutionTransactionRequest = {
      chain: params.chain,
      type: params.type,
      startTime: params.startTime,
      endTime: params.endTime,
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    };

    logger.info({ chain: params.chain, type: params.type }, 'Querying institution transactions');

    const response = await this.client.post('/query_institution_txs', request);
    return response as CleanverseResponse<any>;
  }

  /**
   * Download travel rule report or transaction report
   * POST /download_travel_rule
   */
  async downloadTravelRule(params: {
    type: 'TRAVEL_RULE' | 'TRANSACTION_REPORT';
    chain?: string;
    txHash: string;
  }): Promise<CleanverseResponse<TravelRuleDownload>> {
    const request: DownloadTravelRuleRequest = {
      type: params.type,
      chain: params.chain,
      txHash: params.txHash,
    };

    logger.info({ type: params.type, txHash: params.txHash }, 'Downloading travel rule');

    const response = await this.client.post<TravelRuleDownload>('/download_travel_rule', request);
    return response;
  }

  /**
   * Request test tokens from faucet
   * POST /faucet
   */
  async requestFaucet(params: {
    chain: string;
    symbol: string;
    depositAddress: string;
    amount: string;
  }): Promise<CleanverseResponse<FaucetResponse>> {
    const request: FaucetRequest = {
      chain: params.chain,
      symbol: params.symbol,
      depositAddress: params.depositAddress,
      amount: params.amount,
    };

    logger.info({ 
      chain: params.chain,
      symbol: params.symbol,
      amount: params.amount,
      depositAddress: params.depositAddress 
    }, 'Requesting faucet tokens');

    const response = await this.client.post<FaucetResponse>('/faucet', request);
    return response;
  }

  /**
   * Get deposit A-Token list
   * POST /query_deposit_atoken_list
   */
  async queryDepositATokenList(): Promise<CleanverseResponse<{
    list: Array<{
      atokenId: string;
      atokenAddress: string;
      chain: string;
      tokenName: string;
      tokenSymbol: string;
    }>;
  }>> {
    const response = await this.client.post('/query_deposit_atoken_list', {});
    return response as CleanverseResponse<any>;
  }

  /**
   * Get institution whitelist
   * POST /query_institution_white_list
   */
  async queryInstitutionWhiteList(params?: {
    chain?: string;
    page?: number;
    pageSize?: number;
  }): Promise<CleanverseResponse<{
    list: Array<{
      address: string;
      chain: string;
      txHash: string;
      createdAt: string;
    }>;
    total: number;
  }>> {
    const response = await this.client.post('/query_institution_white_list', {
      chain: params?.chain,
      page: params?.page || 1,
      pageSize: params?.pageSize || 20,
    });
    return response as CleanverseResponse<any>;
  }

  /**
   * Verify a specific transaction exists
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    const response = await this.queryTransactions({ txHash });
    if (this.client.isSuccess(response)) {
      return response.data.txs?.some((tx: Transaction) => tx.tx_hash === txHash) || false;
    }
    return false;
  }

  /**
   * Get transactions for deal wallet
   */
  async getDealWalletTransactions(
    chain: string,
    dealWalletAddress: string,
    startTime?: number,
    endTime?: number
  ): Promise<Transaction[]> {
    const response = await this.queryTransactions({
      chain,
      address: dealWalletAddress,
      startTime,
      endTime,
    });

    if (this.client.isSuccess(response)) {
      return response.data.txs || [];
    }
    return [];
  }
}

// Singleton instance
let auditServiceInstance: AuditService | null = null;

export function getAuditService(): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new AuditService();
  }
  return auditServiceInstance;
}

export default getAuditService;
