import { config } from '../../config';
import { logger } from '../../config';
import {
  CircleResponse,
  CreateWalletRequest,
  CreateWalletResponse,
  CreateAddressRequest,
  CreateAddressResponse,
  GetBalancesResponse,
  CreateTransferRequest,
  CreateTransferResponse,
  GetTransferResponse,
  CircleBlockchain,
  Transfer,
} from './types';

/**
 * Circle API Client
 * 
 * Handles all communication with Circle's Developer API.
 * Production: https://api.circle.com/v1/
 * Sandbox: https://api-sandbox.circle.com/v1/
 */
export class CircleClient {
  private baseUrl: string;
  private apiKey: string;
  private entitySecret: string;

  constructor() {
    // Ensure base URL ends with /v1 for API calls
    const envUrl = process.env.CIRCLE_BASE_URL || 'https://api-sandbox.circle.com';
    this.baseUrl = envUrl.endsWith('/v1') ? envUrl : `${envUrl}/v1`;
    this.apiKey = process.env.CIRCLE_API_KEY || '';
    this.entitySecret = process.env.CIRCLE_ENTITY_SECRET || '';
  }

  /**
   * Make authenticated request to Circle API
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    // Add idempotency key for mutating requests
    if (method !== 'GET' && body?.idempotencyKey) {
      headers['Idempotency-Key'] = body.idempotencyKey;
    }

    try {
      logger.debug({ method, path, url, baseUrl: this.baseUrl }, 'Circle API request');

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error({ 
          status: response.status, 
          error: data 
        }, 'Circle API error');
        throw new Error(`Circle API error: ${response.status} - ${JSON.stringify(data)}`);
      }

      return data as T;
    } catch (error) {
      logger.error({ error, method, path, url }, 'Circle API request failed');
      throw error;
    }
  }

  // ============ Wallet Operations ============

  /**
   * Create a new wallet
   * POST /v1/wallets
   */
  async createWallet(request: CreateWalletRequest): Promise<CreateWalletResponse> {
    return this.request<CreateWalletResponse>('POST', '/v1/wallets', request);
  }

  /**
   * Get wallet by ID
   * GET /v1/wallets/{id}
   */
  async getWallet(walletId: string): Promise<CircleResponse> {
    return this.request<CircleResponse>('GET', `/v1/wallets/${walletId}`);
  }

  /**
   * List all wallets
   * GET /v1/wallets
   */
  async listWallets(): Promise<CircleResponse & { data: { wallets: any[] } }> {
    return this.request<CircleResponse & { data: { wallets: any[] } }>('GET', '/v1/wallets');
  }

  /**
   * Get wallet addresses
   * GET /v1/wallets/{id}/addresses
   */
  async getWalletAddresses(walletId: string): Promise<CircleResponse & { data: { addresses: any[] } }> {
    return this.request<CircleResponse & { data: { addresses: any[] } }>(
      'GET', 
      `/v1/wallets/${walletId}/addresses`
    );
  }

  /**
   * Create a new address for a wallet
   * POST /v1/wallets/{id}/addresses
   */
  async createAddress(walletId: string, request: Omit<CreateAddressRequest, 'walletId'>): Promise<CreateAddressResponse> {
    return this.request<CreateAddressResponse>(
      'POST', 
      `/v1/wallets/${walletId}/addresses`,
      request
    );
  }

  /**
   * Get wallet balances
   * GET /v1/wallets/{id}/balances
   */
  async getWalletBalances(walletId: string): Promise<GetBalancesResponse> {
    return this.request<GetBalancesResponse>('GET', `/v1/wallets/${walletId}/balances`);
  }

  // ============ Transfer Operations ============

  /**
   * Create a transfer
   * POST /v1/transfers
   */
  async createTransfer(request: CreateTransferRequest): Promise<CreateTransferResponse> {
    return this.request<CreateTransferResponse>('POST', '/v1/transfers', request);
  }

  /**
   * Get transfer by ID
   * GET /v1/transfers/{id}
   */
  async getTransfer(transferId: string): Promise<GetTransferResponse> {
    return this.request<GetTransferResponse>('GET', `/v1/transfers/${transferId}`);
  }

  /**
   * List transfers
   * GET /v1/transfers
   */
  async listTransfers(params?: { walletId?: string; limit?: number }): Promise<CircleResponse> {
    const queryParams = new URLSearchParams();
    if (params?.walletId) queryParams.set('walletId', params.walletId);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    
    const query = queryParams.toString();
    return this.request<CircleResponse>(
      'GET', 
      `/v1/transfers${query ? `?${query}` : ''}`
    );
  }

  // ============ Master Wallet Operations ============

  /**
   * Get master wallet (platform wallet)
   * GET /v1/wallets/master
   */
  async getMasterWallet(): Promise<CircleResponse> {
    return this.request<CircleResponse>('GET', '/v1/wallets/master');
  }

  /**
   * Get master wallet deposit address
   * GET /v1/wallets/master/addresses
   */
  async getMasterWalletAddresses(): Promise<CircleResponse & { data: { addresses: any[] } }> {
    return this.request<CircleResponse & { data: { addresses: any[] } }>(
      'GET', 
      '/v1/wallets/master/addresses'
    );
  }

  /**
   * Create address for master wallet
   * POST /v1/wallets/master/addresses
   */
  async createMasterWalletAddress(request: { blockchain: CircleBlockchain; currency: string }): Promise<CreateAddressResponse> {
    return this.request<CreateAddressResponse>(
      'POST', 
      '/v1/wallets/master/addresses',
      request
    );
  }

  /**
   * Get master wallet balances
   * GET /v1/wallets/master/balances
   */
  async getMasterWalletBalances(): Promise<GetBalancesResponse> {
    return this.request<GetBalancesResponse>('GET', '/v1/wallets/master/balances');
  }

  // ============ Utility Methods ============

  /**
   * Generate a unique idempotency key
   */
  generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Check if a transfer is complete
   */
  isTransferComplete(transfer: Transfer): boolean {
    return transfer.status === 'COMPLETE';
  }

  /**
   * Check if a transfer failed
   */
  isTransferFailed(transfer: Transfer): boolean {
    return transfer.status === 'FAILED';
  }
}

// Singleton instance
let circleClientInstance: CircleClient | null = null;

export function getCircleClient(): CircleClient {
  if (!circleClientInstance) {
    circleClientInstance = new CircleClient();
  }
  return circleClientInstance;
}

export { CircleClient as CircleApiClient };
