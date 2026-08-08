import { getCleanverseClient, CleanverseClient } from './client';
import {
  RampCountry,
  RampFiatCurrency,
  RampCryptoCurrency,
  RampPaymentMethod,
  RampQuoteRequest,
  RampQuote,
  RampWidgetUrl,
  RampOrder,
  FaucetResponse,
  CleanverseResponse,
} from './types';
import { logger } from '../../config';

export class RampService {
  private client: CleanverseClient;

  constructor() {
    this.client = getCleanverseClient();
  }

  /**
   * Get supported countries for fiat ramp
   * POST /query_ramp_countries
   */
  async getCountries(): Promise<CleanverseResponse<RampCountry[]>> {
    const response = await this.client.post<RampCountry[]>('/query_ramp_countries', {});

    logger.info({
      count: Array.isArray(response.data) ? response.data.length : 0
    }, 'Get ramp countries');

    return response;
  }

  /**
   * Get supported fiat currencies
   * POST /query_ramp_fiat_currencies
   */
  async getFiatCurrencies(params?: {
    country?: string;
  }): Promise<CleanverseResponse<RampFiatCurrency[]>> {
    const response = await this.client.post<RampFiatCurrency[]>('/query_ramp_fiat_currencies', {
      country: params?.country,
    });

    logger.info({
      count: Array.isArray(response.data) ? response.data.length : 0,
      country: params?.country
    }, 'Get ramp fiat currencies');

    return response;
  }

  /**
   * Get supported crypto currencies
   * POST /query_ramp_crypto_currencies
   */
  async getCryptoCurrencies(params?: {
    network?: string;
  }): Promise<CleanverseResponse<RampCryptoCurrency[]>> {
    const response = await this.client.post<RampCryptoCurrency[]>('/query_ramp_crypto_currencies', {
      network: params?.network,
    });

    logger.info({
      count: Array.isArray(response.data) ? response.data.length : 0,
      network: params?.network
    }, 'Get ramp crypto currencies');

    return response;
  }

  /**
   * Get payment methods
   * POST /query_ramp_payment_methods
   */
  async getPaymentMethods(params?: {
    country?: string;
    currency?: string;
  }): Promise<CleanverseResponse<RampPaymentMethod[]>> {
    const response = await this.client.post<RampPaymentMethod[]>('/query_ramp_payment_methods', {
      country: params?.country,
      currency: params?.currency,
    });

    logger.info({
      count: Array.isArray(response.data) ? response.data.length : 0
    }, 'Get ramp payment methods');

    return response;
  }

  /**
   * Get fiat ramp quote (on-ramp: fiat -> crypto)
   * POST /query_ramp_quote
   */
  async getQuote(params: {
    fiatCurrency: string;
    cryptoCurrency: string;
    amount: string;
    isBuyOrSell: 'BUY' | 'SELL';
    network?: string;
    paymentMethod?: string;
    country?: string;
    partnerCustomerId?: string;
  }): Promise<CleanverseResponse<RampQuote>> {
    const request: RampQuoteRequest = {
      fiatCurrency: params.fiatCurrency,
      cryptoCurrency: params.cryptoCurrency,
      amount: params.amount,
      isBuyOrSell: params.isBuyOrSell,
      network: params.network,
      paymentMethod: params.paymentMethod,
      country: params.country,
      partnerCustomerId: params.partnerCustomerId,
    };

    logger.info({
      fiatCurrency: params.fiatCurrency,
      cryptoCurrency: params.cryptoCurrency,
      amount: params.amount,
      isBuyOrSell: params.isBuyOrSell,
      country: params.country
    }, 'Get ramp quote');

    const response = await this.client.post<RampQuote>('/query_ramp_quote', request);
    return response;
  }

  /**
   * Create widget URL for user to complete payment
   * POST /create_ramp_widget_url
   */
  async createWidgetUrl(params: {
    quoteToken: string;
    walletAddress: string;
    walletChain: string;
  }): Promise<CleanverseResponse<RampWidgetUrl>> {
    const request = {
      quoteToken: params.quoteToken,
      walletAddress: params.walletAddress,
      walletChain: params.walletChain,
    };

    logger.info({
      quoteToken: params.quoteToken,
      walletAddress: params.walletAddress,
      walletChain: params.walletChain
    }, 'Creating ramp widget URL');

    const response = await this.client.post<RampWidgetUrl>('/create_ramp_widget_url', request);
    return response;
  }

  /**
   * Query ramp order status
   * POST /query_ramp_order
   */
  async queryOrder(params: {
    orderId?: string;
    quoteToken?: string;
    partnerCustomerId?: string;
  }): Promise<CleanverseResponse<RampOrder>> {
    const request = {
      orderId: params.orderId,
      quoteToken: params.quoteToken,
      partnerCustomerId: params.partnerCustomerId,
    };

    logger.info({
      orderId: params.orderId,
      partnerCustomerId: params.partnerCustomerId
    }, 'Querying ramp order');

    const response = await this.client.post<RampOrder>('/query_ramp_order', request);
    return response;
  }

  /**
   * Poll for order completion
   */
  async pollForOrderCompletion(
    quoteToken: string,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<CleanverseResponse<RampOrder>> {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.queryOrder({ quoteToken });

      if (this.client.isSuccess(response)) {
        const status = response.data?.status;

        if (status === 'COMPLETED') {
          logger.info({ quoteToken }, 'Ramp order completed');
          return response;
        }

        if (status === 'FAILED' || status === 'REFUNDED') {
          logger.warn({ quoteToken, status }, 'Ramp order failed/refunded');
          return response;
        }

        logger.debug({ quoteToken, status, attempt: i + 1 }, 'Waiting for order completion...');
        await this.delay(intervalMs);
      } else {
        throw new Error(`Failed to query ramp order: ${this.client.getError(response)}`);
      }
    }

    throw new Error(`Ramp order timeout after ${maxAttempts} attempts`);
  }

  /**
   * Get on-ramp quote for investor funding (fiat -> USDC)
   */
  async getOnRampQuote(params: {
    fiatAmount: string;
    fiatCurrency: string;
    partnerCustomerId: string;
  }): Promise<CleanverseResponse<RampQuote>> {
    return this.getQuote({
      fiatCurrency: params.fiatCurrency,
      cryptoCurrency: 'USDC',
      amount: params.fiatAmount,
      isBuyOrSell: 'BUY',
      partnerCustomerId: params.partnerCustomerId,
    });
  }

  /**
   * Get off-ramp quote for payouts (USDC -> fiat)
   */
  async getOffRampQuote(params: {
    cryptoAmount: string;
    fiatCurrency: string;
    partnerCustomerId: string;
  }): Promise<CleanverseResponse<RampQuote>> {
    return this.getQuote({
      fiatCurrency: params.fiatCurrency,
      cryptoCurrency: 'USDC',
      amount: params.cryptoAmount,
      isBuyOrSell: 'SELL',
      partnerCustomerId: params.partnerCustomerId,
    });
  }

  /**
   * Request test tokens from faucet
   * POST /faucet - Plain JSON (no encryption)
   */
  async requestFaucet(params: {
    chain: string;
    symbol: string;
    depositAddress: string;
    amount: string;
  }): Promise<CleanverseResponse<FaucetResponse>> {
    logger.info({
      chain: params.chain,
      symbol: params.symbol,
      amount: params.amount,
      depositAddress: params.depositAddress
    }, 'Requesting faucet tokens');

    // Faucet endpoint uses plain JSON (no encryption)
    const response = await this.client.post<FaucetResponse>('/faucet', {
      chain: params.chain,
      symbol: params.symbol,
      depositAddress: params.depositAddress,
      amount: params.amount,
    });

    return response;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let rampServiceInstance: RampService | null = null;

export function getRampService(): RampService {
  if (!rampServiceInstance) {
    rampServiceInstance = new RampService();
  }
  return rampServiceInstance;
}

export default getRampService;
