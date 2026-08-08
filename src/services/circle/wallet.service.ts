import { getCircleClient, CircleClient } from './client';
import { getEntitySecretService, EntitySecretService } from './entity-secret.service';
import { prisma } from '../../config/database';
import { logger } from '../../config';
import {
  CircleBlockchain,
  CircleWallet,
  Transfer,
  WalletBalance,
  TokenBalance,
} from './types';

/**
 * Circle Wallet Service
 * 
 * Manages Circle wallets for ClearFlow deals.
 * Each deal gets its own wallet for USDC settlement.
 * 
 * Flow:
 * 1. Create deal wallet when deal is created
 * 2. Investors send USDC to deal wallet (external transfer)
 * 3. Pay supplier from deal wallet
 * 4. Distribute repayment to investors from deal wallet
 */
export class CircleWalletService {
  private client: CircleClient;
  private entitySecretService: EntitySecretService;

  constructor() {
    this.client = getCircleClient();
    this.entitySecretService = getEntitySecretService();
  }

  /**
   * Create a wallet for a deal
   * 
   * Each financing deal gets its own Circle wallet for USDC settlement.
   * This wallet collects contributions and pays out suppliers/investors.
   */
  async createDealWallet(dealId: string, chain: CircleBlockchain = 'MATIC'): Promise<{
    success: boolean;
    walletId?: string;
    address?: string;
    error?: string;
  }> {
    logger.info({ dealId, chain }, 'Creating Circle wallet for deal');

    try {
      // Get entity secret ciphertext for developer-controlled wallet
      const ciphertextResult = await this.entitySecretService.getEntitySecretCiphertext();
      
      if (!ciphertextResult.success || !ciphertextResult.ciphertext) {
        return {
          success: false,
          error: `Failed to get entity secret: ${ciphertextResult.error}`,
        };
      }

      // Create wallet on Circle with developer-controlled account
      const response = await this.client.createWallet({
        blockchain: chain,
        type: 'CONTRACT',
        entitySecretCiphertext: ciphertextResult.ciphertext,
      });

      const walletData = response.data;

      // Create USDC deposit address
      const addressResponse = await this.client.createAddress(walletData.walletId, {
        blockchain: chain,
        currency: 'USDC',
      });

      const depositAddress = addressResponse.data.address;

      logger.info({ 
        dealId, 
        walletId: walletData.walletId,
        address: depositAddress 
      }, 'Circle wallet created for deal');

      return {
        success: true,
        walletId: walletData.walletId,
        address: depositAddress,
      };
    } catch (error) {
      logger.error({ error, dealId }, 'Failed to create Circle wallet');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create wallet',
      };
    }
  }

  /**
   * Get deal wallet info
   */
  async getDealWallet(walletId: string): Promise<{
    success: boolean;
    wallet?: CircleWallet;
    error?: string;
  }> {
    try {
      const response = await this.client.getWallet(walletId);
      return {
        success: true,
        wallet: response.data as CircleWallet,
      };
    } catch (error) {
      logger.error({ error, walletId }, 'Failed to get wallet');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get wallet',
      };
    }
  }

  /**
   * Get wallet balances
   */
  async getWalletBalances(walletId: string): Promise<{
    success: boolean;
    balances?: TokenBalance[];
    totalUsdc?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.getWalletBalances(walletId);
      const data = response.data;
      
      const usdcBalance = data.balances?.find(
        (b: TokenBalance) => b.token.symbol === 'USDC'
      );

      return {
        success: true,
        balances: data.balances || [],
        totalUsdc: usdcBalance?.amount || '0',
      };
    } catch (error) {
      logger.error({ error, walletId }, 'Failed to get wallet balances');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get balances',
      };
    }
  }

  /**
   * Get USDC deposit address for a wallet
   */
  async getDepositAddress(walletId: string): Promise<{
    success: boolean;
    address?: string;
    error?: string;
  }> {
    try {
      const response = await this.client.getWalletAddresses(walletId);
      const addresses = response.data.addresses || [];
      
      // Find USDC address
      const usdcAddress = addresses.find(
        (a: any) => a.currency === 'USDC' || a.currency === 'USD'
      );

      if (usdcAddress) {
        return {
          success: true,
          address: usdcAddress.address,
        };
      }

      return {
        success: false,
        error: 'No USDC address found for wallet',
      };
    } catch (error) {
      logger.error({ error, walletId }, 'Failed to get deposit address');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get address',
      };
    }
  }

  /**
   * Transfer USDC from deal wallet to an address
   * 
   * Used for:
   * - Paying supplier
   * - Distributing repayment to investors
   */
  async transferFromDealWallet(params: {
    dealWalletId: string;
    destinationAddress: string;
    amount: string; // Amount in USDC (smallest unit if applicable)
    currency?: string;
    dealId: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    status?: string;
    error?: string;
  }> {
    const { dealWalletId, destinationAddress, amount, currency = 'USDC', dealId } = params;

    logger.info({ 
      dealId,
      dealWalletId,
      destinationAddress, 
      amount,
      currency 
    }, 'Initiating transfer from deal wallet');

    try {
      // Verify wallet has sufficient balance
      const balanceResult = await this.getWalletBalances(dealWalletId);
      if (!balanceResult.success) {
        return { success: false, error: balanceResult.error };
      }

      const balance = parseFloat(balanceResult.totalUsdc || '0');
      const amountNum = parseFloat(amount);

      if (balance < amountNum) {
        return {
          success: false,
          error: `Insufficient balance. Have: ${balance}, Need: ${amountNum}`,
        };
      }

      // Create transfer
      const idempotencyKey = this.client.generateIdempotencyKey();
      const transferResponse = await this.client.createTransfer({
        idempotencyKey,
        walletId: dealWalletId,
        destinationAddress,
        amount: {
          amount,
          currency,
        },
        feeLevel: 'MEDIUM',
      });

      const transfer = transferResponse.data;

      logger.info({ 
        dealId,
        transferId: transfer.id,
        status: transfer.status 
      }, 'Transfer initiated');

      return {
        success: true,
        transferId: transfer.id,
        status: transfer.status,
      };
    } catch (error) {
      logger.error({ error, dealId, dealWalletId }, 'Failed to create transfer');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create transfer',
      };
    }
  }

  /**
   * Get transfer status
   */
  async getTransferStatus(transferId: string): Promise<{
    success: boolean;
    transfer?: Transfer;
    error?: string;
  }> {
    try {
      const response = await this.client.getTransfer(transferId);
      return {
        success: true,
        transfer: response.data as Transfer,
      };
    } catch (error) {
      logger.error({ error, transferId }, 'Failed to get transfer');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transfer',
      };
    }
  }

  /**
   * Pay supplier from deal wallet
   * 
   * Called when a deal is funded and ready for settlement.
   */
  async paySupplier(params: {
    dealId: string;
    dealWalletId: string;
    supplierAddress: string;
    amount: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    error?: string;
  }> {
    const { dealId, dealWalletId, supplierAddress, amount } = params;

    logger.info({ dealId, supplierAddress, amount }, 'Paying supplier from deal wallet');

    const result = await this.transferFromDealWallet({
      dealWalletId,
      destinationAddress: supplierAddress,
      amount,
      dealId,
    });

    if (result.success) {
      // Log the payment in database
      await prisma.auditLog.create({
        data: {
          entityType: 'DEAL',
          entityId: dealId,
          action: 'SUPPLIER_PAYMENT',
          details: {
            transferId: result.transferId,
            supplierAddress,
            amount,
            status: result.status,
          },
        },
      });
    }

    return result;
  }

  /**
   * Distribute repayment to investors
   * 
   * Each investor receives their proportional share of the repayment
   * (principal + yield) based on their contribution.
   */
  async distributeRepayment(params: {
    dealId: string;
    dealWalletId: string;
    investorPayouts: Array<{
      investorAddress: string;
      amount: string;
    }>;
  }): Promise<{
    success: boolean;
    transfers: Array<{
      investorAddress: string;
      transferId?: string;
      status?: string;
      error?: string;
    }>;
    error?: string;
  }> {
    const { dealId, dealWalletId, investorPayouts } = params;

    logger.info({ dealId, investorCount: investorPayouts.length }, 'Distributing repayment to investors');

    const results = [];

    for (const payout of investorPayouts) {
      const result = await this.transferFromDealWallet({
        dealWalletId,
        destinationAddress: payout.investorAddress,
        amount: payout.amount,
        dealId,
      });

      results.push({
        investorAddress: payout.investorAddress,
        transferId: result.transferId,
        status: result.status,
        error: result.error,
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Log distribution in database
    await prisma.auditLog.create({
      data: {
        entityType: 'DEAL',
        entityId: dealId,
        action: 'REPAYMENT_DISTRIBUTION',
        details: {
          transfers: results,
          totalPayouts: investorPayouts.length,
        },
      },
    });

    const allSuccess = results.every(r => r.transferId && !r.error);

    return {
      success: allSuccess,
      transfers: results,
      error: allSuccess ? undefined : 'Some payouts failed',
    };
  }

  /**
   * Sync wallet balance to database
   */
  async syncWalletBalanceToDatabase(dealId: string, walletId: string): Promise<void> {
    try {
      const balanceResult = await this.getWalletBalances(walletId);
      
      if (balanceResult.success) {
        logger.info({ 
          dealId, 
          walletId, 
          usdcBalance: balanceResult.totalUsdc 
        }, 'Synced wallet balance to database');
      }
    } catch (error) {
      logger.error({ error, dealId, walletId }, 'Failed to sync wallet balance');
    }
  }
}

// Singleton instance
let walletServiceInstance: CircleWalletService | null = null;

export function getCircleWalletService(): CircleWalletService {
  if (!walletServiceInstance) {
    walletServiceInstance = new CircleWalletService();
  }
  return walletServiceInstance;
}

export default getCircleWalletService;
