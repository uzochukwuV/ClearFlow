import { randomUUID } from 'crypto';
import {
  initiateDeveloperControlledWalletsClient,
  type CircleDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets';
import { logger } from '../../config';
import { CircleBlockchain } from './types';

/**
 * Maps ClearFlow's internal chain names to Circle's SDK blockchain values.
 *
 * ClearFlow uses lowercased chain names ('base', 'polygon', ...) internally
 * (see constants.DEFAULT_CHAIN and the deal routes). These map to Circle's
 * network identifiers. The configured Circle API key is a TEST key, so we
 * target testnets (BASE-SEPOLIA / MATIC-AMOY).
 */
const CHAIN_MAP: Record<string, string> = {
  MONAD: 'MONAD-TESTNET',
  'MONAD-TESTNET': 'MONAD-TESTNET',
  MATIC: 'MATIC-AMOY',
  POLYGON: 'MATIC-AMOY',
  'MATIC-AMOY': 'MATIC-AMOY',
  ETH: 'ETH-SEPOLIA',
  ETHEREUM: 'ETH-SEPOLIA',
  BASE: 'BASE-SEPOLIA',
  ARB: 'ARB-SEPOLIA',
  AVAX: 'AVAX-FUJI',
  OP: 'OP-SEPOLIA',
};

function toSdkChain(chain?: string): string {
  if (!chain) return 'BASE-SEPOLIA';
  return CHAIN_MAP[chain.toUpperCase()] ?? 'BASE-SEPOLIA';
}

/**
 * USDC token reference for transfers.
 *
 * Circle transfers require either a tokenId (Circle-issued USDC) or a
 * tokenAddress (USDC contract on the chain). For EVM chains we use the
 * well-known USDC contract address; override via USDC_TOKEN_ID / USDC_TOKEN_ADDRESS.
 */
function usdcTokenRef(blockchain: string): { tokenId?: string; tokenAddress?: string } {
  const tokenId = process.env.USDC_TOKEN_ID;
  if (tokenId) return { tokenId };
  const tokenAddress = process.env.USDC_TOKEN_ADDRESS;
  if (tokenAddress) return { tokenAddress };

  // Known Circle-issued USDC testnet contract addresses (6 decimals).
  // See https://developers.circle.com/stablecoins/usdc-contract-addresses
  const USDC_BY_CHAIN: Record<string, string> = {
    'MONAD-TESTNET': '0x534b2f3A21130d7a60830c2Df862319e593943A3',
    'MATIC-AMOY': '0x41e94eb0197b8c4598696582a731693a580c15a2',
    'ETH-SEPOLIA': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    'BASE-SEPOLIA': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    'ARB-SEPOLIA': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  };
  const tokenAddressForChain = USDC_BY_CHAIN[blockchain];
  if (tokenAddressForChain) return { tokenAddress: tokenAddressForChain };

  return {};
}

export class CircleWalletService {
  private client: CircleDeveloperControlledWalletsClient;
  private walletSetId: string;

  constructor() {
    const apiKey = process.env.CIRCLE_API_KEY;
    const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.replace(/["']/g, '');
    this.walletSetId = process.env.CIRCLE_WALLET_SET_ID || '';

    if (!apiKey || !entitySecret || !this.walletSetId) {
      throw new Error(
        'Circle not configured: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET and CIRCLE_WALLET_SET_ID are required'
      );
    }

    this.client = initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
      baseUrl: process.env.CIRCLE_BASE_URL,
    });
  }

  /**
   * Create one developer-controlled wallet inside the configured wallet set,
   * dedicated to a single financing deal. The wallet holds all USDC for the
   * deal (investor contributions, supplier payout, investor payouts).
   */
  async createDealWallet(
    dealId: string,
    chain: CircleBlockchain = 'BASE'
  ): Promise<{
    success: boolean;
    walletId?: string;
    address?: string;
    error?: string;
  }> {
    const blockchain = toSdkChain(chain);
    logger.info({ dealId, chain, blockchain }, 'Creating Circle deal wallet');

    try {
      const res = await this.client.createWallets({
        idempotencyKey: randomUUID(),
        blockchains: [blockchain as any],
        count: 1,
        walletSetId: this.walletSetId,
        accountType: 'EOA',
        metadata: [{ refId: `deal-${dealId}` }],
      } as any);

      const wallet = (res as any).data?.wallets?.[0];
      if (!wallet?.id || !wallet?.address) {
        return { success: false, error: 'Circle returned no wallet in response' };
      }

      logger.info(
        { dealId, walletId: wallet.id, address: wallet.address, blockchain: wallet.blockchain },
        'Circle deal wallet created'
      );

      return {
        success: true,
        walletId: wallet.id,
        address: wallet.address,
      };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ dealId, error: message, raw: error?.response?.data }, 'Failed to create Circle deal wallet');
      return { success: false, error: message };
    }
  }

  /**
   * Get token balances for a wallet and aggregate USDC.
   */
  async getWalletBalances(walletId: string): Promise<{
    success: boolean;
    balances?: any[];
    totalUsdc?: string;
    error?: string;
  }> {
    try {
      const res = await this.client.getWalletTokenBalance({ id: walletId });
      const balances = (res as any).data?.tokenBalances ?? [];
      const totalUsdc = balances
        .filter((b: any) => b?.token?.symbol?.toUpperCase() === 'USDC')
        .reduce((sum: number, b: any) => sum + parseFloat(b.amount || '0'), 0)
        .toFixed(6);

      return { success: true, balances, totalUsdc };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ walletId, error: message }, 'Failed to get wallet balances');
      return { success: false, error: message };
    }
  }

  /**
   * Transfer USDC from the deal wallet to a destination address.
   * Used for supplier payouts, refunds, and investor claim payouts.
   */
  async transferFromDealWallet(params: {
    dealWalletId: string;
    destinationAddress: string;
    amount: string;
    currency?: string;
    dealId: string;
  }): Promise<{
    success: boolean;
    transferId?: string;
    status?: string;
    error?: string;
  }> {
    const { dealId, dealWalletId, destinationAddress, amount } = params;
    logger.info({ dealId, dealWalletId, destinationAddress, amount }, 'Initiating Circle transfer');

    try {
      // Look up the source wallet to get its blockchain
      const walletRes = await this.client.getWallet({ id: dealWalletId });
      const blockchain = (walletRes as any).data?.wallet?.blockchain;
      if (!blockchain) {
        return { success: false, error: 'Could not determine blockchain for source wallet' };
      }

      const res = await this.client.createTransaction({
        amount: [amount],
        walletId: dealWalletId,
        destinationAddress,
        blockchain: blockchain as any,
        fee: {
          type: 'level',
          config: { feeLevel: 'MEDIUM' },
        },
        ...usdcTokenRef(blockchain),
      } as any);

      const txn = (res as any).data?.transaction ?? (res as any).data;
      const transferId = txn?.id;
      const status = txn?.state || 'PENDING';

      logger.info({ dealId, transferId, status }, 'Circle transfer initiated');
      return { success: true, transferId, status };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ dealId, error: message, raw: error?.response?.data }, 'Circle transfer failed');
      return { success: false, error: message };
    }
  }

  /**
   * Pay the supplier from the deal wallet. Convenience wrapper.
   */
  async paySupplier(params: {
    dealId: string;
    dealWalletId: string;
    supplierAddress: string;
    amount: string;
  }): Promise<{ success: boolean; transferId?: string; error?: string }> {
    const result = await this.transferFromDealWallet({
      dealWalletId: params.dealWalletId,
      destinationAddress: params.supplierAddress,
      amount: params.amount,
      dealId: params.dealId,
    });
    return { success: result.success, transferId: result.transferId, error: result.error };
  }

  /**
   * Distribute repayment to multiple investors from the deal wallet.
   */
  async distributeRepayment(params: {
    dealId: string;
    dealWalletId: string;
    investorPayouts: Array<{ investorAddress: string; amount: string }>;
  }): Promise<{
    success: boolean;
    transfers: Array<{ investorAddress: string; transferId?: string; status?: string; error?: string }>;
  }> {
    const { dealId, dealWalletId, investorPayouts } = params;
    const transfers: Array<{ investorAddress: string; transferId?: string; status?: string; error?: string }> = [];

    for (const payout of investorPayouts) {
      const result = await this.transferFromDealWallet({
        dealWalletId,
        destinationAddress: payout.investorAddress,
        amount: payout.amount,
        dealId,
      });
      transfers.push({
        investorAddress: payout.investorAddress,
        transferId: result.transferId,
        status: result.status,
        error: result.error,
      });
    }

    const failed = transfers.filter((t) => !t.transferId);
    logger.info(
      { dealId, total: transfers.length, failed: failed.length },
      'Repayment distribution complete'
    );

    return { success: failed.length === 0, transfers };
  }

  /**
   * Get a wallet by ID (metadata only, no balances).
   */
  async getDealWallet(walletId: string): Promise<{
    success: boolean;
    wallet?: any;
    error?: string;
  }> {
    try {
      const res = await this.client.getWallet({ id: walletId });
      const wallet = (res as any).data?.wallet;
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }
      return { success: true, wallet };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ walletId, error: message }, 'Failed to get wallet');
      return { success: false, error: message };
    }
  }

  /**
   * Get the deposit address for a wallet. For developer-controlled EVM wallets
   * the wallet address itself is the deposit address.
   */
  async getDepositAddress(walletId: string): Promise<{
    success: boolean;
    address?: string;
    error?: string;
  }> {
    const result = await this.getDealWallet(walletId);
    if (!result.success || !result.wallet) {
      return { success: false, error: result.error };
    }
    return { success: true, address: result.wallet.address };
  }

  /**
   * Get the status of a transfer/transaction by ID.
   */
  async getTransferStatus(transferId: string): Promise<{
    success: boolean;
    transfer?: any;
    error?: string;
  }> {
    try {
      const res = await this.client.getTransaction({ id: transferId });
      const txn = (res as any).data?.transaction;
      if (!txn) {
        return { success: false, error: 'Transaction not found' };
      }
      return {
        success: true,
        transfer: {
          id: txn.id,
          status: txn.state,
          txHash: txn.txHash,
          destinationAddress: txn.destinationAddress,
          amounts: txn.amounts,
          blockchain: txn.blockchain,
        },
      };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ transferId, error: message }, 'Failed to get transfer status');
      return { success: false, error: message };
    }
  }
  /**
   * List inbound transfer transactions for a deal wallet.
   *
   * Used by the deposit verification layer to confirm that USDC sent by an
   * investor actually landed in the deal wallet. Filters Circle's
   * transaction history to transfers whose destinationAddress equals the
   * wallet address and whose state is CONFIRMED or COMPLETE.
   */
  async listInboundTransactions(walletId: string): Promise<{
    success: boolean;
    transactions?: Array<{
      id: string;
      txHash?: string;
      sourceAddress?: string;
      destinationAddress?: string;
      amounts?: string[];
      state: string;
      blockchain?: string;
      createDate?: string;
    }>;
    error?: string;
  }> {
    try {
      // Resolve the wallet address + blockchain first.
      const walletRes = await this.client.getWallet({ id: walletId });
      const wallet = (walletRes as any).data?.wallet;
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }
      const address = wallet.address as string;

      const res = await this.client.listTransactions({
        walletIds: [walletId],
        custodyType: 'DEVELOPER',
        operation: 'TRANSFER',
      } as any);

      const txns = (res as any).data?.transactions ?? [];
      // Circle lists both inbound and outbound transfers for a wallet; we only
      // care about inbound (deposits) whose destination is our wallet and that
      // have settled on-chain.
      const settled = ['COMPLETE', 'CONFIRMED'];
      const inbound = txns
        .filter((t: any) => settled.includes(t.state))
        .filter((t: any) =>
          (t.destinationAddress || '').toLowerCase() === address.toLowerCase()
        )
        .map((t: any) => ({
          id: t.id,
          txHash: t.txHash,
          sourceAddress: t.sourceAddress,
          destinationAddress: t.destinationAddress,
          amounts: t.amounts,
          state: t.state,
          blockchain: t.blockchain,
          createDate: t.createDate,
        }));

      return { success: true, transactions: inbound };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ walletId, error: message }, 'Failed to list inbound transactions');
      return { success: false, error: message };
    }
  }

  // ─── Platform admin wallet (Circle developer-controlled) ───────────────
  //
  // The admin wallet is a Circle developer-controlled wallet in the wallet set,
  // NOT an external EOA with a private key. Circle holds the key; the backend
  // controls it via the entity secret. This lets the backend:
  //   • sign EIP-191 admin-approval messages server-side (signMessageWithWallet)
  //   • receive the 3% platform fee (sweepToAdminWallet)
  // The wallet ID is configured via CIRCLE_ADMIN_WALLET_ID (set up once by
  // scripts/setup-admin-wallet.ts). Its on-chain address is resolved + cached.

  private adminWalletCache: { walletId: string; address: string } | null = null;

  /**
   * Resolve the platform admin Circle wallet { walletId, address }.
   * Falls back to CLEANVERSE_ADMIN_WALLET (address-only) if CIRCLE_ADMIN_WALLET_ID
   * is not configured, so sign-in operations still work in legacy/demo setups.
   */
  async getAdminWallet(): Promise<{ walletId?: string; address: string }> {
    const adminWalletId = process.env.CIRCLE_ADMIN_WALLET_ID;

    if (adminWalletId) {
      if (this.adminWalletCache?.walletId === adminWalletId) {
        return this.adminWalletCache;
      }
      const res = await this.client.getWallet({ id: adminWalletId });
      const wallet = (res as any).data?.wallet;
      if (!wallet?.address) {
        throw new Error(`Admin wallet ${adminWalletId} not found or has no address`);
      }
      this.adminWalletCache = { walletId: adminWalletId, address: wallet.address };
      logger.debug({ adminWalletId, address: wallet.address }, 'Resolved admin Circle wallet');
      return this.adminWalletCache;
    }

    // Legacy fallback: address only, no Circle wallet ID (no server-side signing).
    const fallback = process.env.CLEANVERSE_ADMIN_WALLET;
    if (!fallback) {
      throw new Error('No admin wallet configured: set CIRCLE_ADMIN_WALLET_ID (or CLEANVERSE_ADMIN_WALLET)');
    }
    return { address: fallback };
  }

  /**
   * Sign an EIP-191 message with a Circle developer-controlled wallet.
   * Used for server-side admin approval signatures (the admin wallet's key is
   * held by Circle, so it cannot sign with MetaMask — the backend signs).
   */
  async signMessageWithWallet(params: { walletId: string; message: string }): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }> {
    try {
      const res = await this.client.signMessage({
        walletId: params.walletId,
        message: params.message,
      } as any);
      const signature = (res as any).data?.signature;
      if (!signature) {
        return { success: false, error: 'signMessage returned no signature' };
      }
      return { success: true, signature };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      logger.error({ walletId: params.walletId, error: message, raw: error?.response?.data }, 'Circle signMessage failed');
      return { success: false, error: message };
    }
  }

  /**
   * Transfer USDC from a deal wallet to the platform admin wallet.
   * Used to sweep the 3% platform fee when a deal is settled.
   */
  async sweepToAdminWallet(params: {
    dealWalletId: string;
    amount: string;
    dealId: string;
  }): Promise<{ success: boolean; transferId?: string; error?: string }> {
    const admin = await this.getAdminWallet();
    if (!admin.walletId) {
      // No Circle admin wallet configured — cannot sweep. Caller should log + skip.
      return { success: false, error: 'No CIRCLE_ADMIN_WALLET_ID configured for fee sweep' };
    }
    const result = await this.transferFromDealWallet({
      dealWalletId: params.dealWalletId,
      destinationAddress: admin.address,
      amount: params.amount,
      dealId: params.dealId,
    });
    return { success: result.success, transferId: result.transferId, error: result.error };
  }
}

export function getCircleWalletService(): CircleWalletService {
  if (!walletServiceInstance) {
    walletServiceInstance = new CircleWalletService();
  }
  return walletServiceInstance;
}

let walletServiceInstance: CircleWalletService | null = null;
