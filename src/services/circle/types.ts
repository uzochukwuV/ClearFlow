/**
 * Circle API Types
 * 
 * Based on Circle Developer API documentation
 * https://developers.circle.com/api-reference
 */

// Circle API Response wrapper
export interface CircleResponse<T = any> {
  data: T;
}

// ============ Wallet Types ============

export type CircleBlockchain = 
  | 'MONAD'
  | 'ETH'
  | 'MATIC'      // Polygon
  | 'SOL'
  | 'AVAX'
  | 'BASE'
  | 'ARB'
  | 'DOT'
  | 'OP';

export type CircleWalletType = 'CONTRACT' | 'ENDUSERED';

export interface CircleWallet {
  walletId: string;
  address: string;
  chain: CircleBlockchain;
  type: CircleWalletType;
  balance?: string;
  updatedAt: string;
  createdAt: string;
}

export interface CreateWalletRequest {
  blockchain: CircleBlockchain;
  type?: CircleWalletType;
  accountType?: 'SCA' | 'EOA'; // Smart Contract Account or Externally Owned Account
  entitySecretCiphertext?: string; // Required for developer-controlled wallets
}

export interface CreateWalletResponse extends CircleResponse {
  data: {
    walletId: string;
    address: string;
    blockchain: CircleBlockchain;
    type: CircleWalletType;
    accountType: string;
    custodyType: string;
  };
}

// ============ Address Types ============

export interface WalletAddress {
  address: string;
  chain: CircleBlockchain;
  currency: string;
  type: 'address';
}

export interface CreateAddressRequest {
  walletId: string;
  blockchain: CircleBlockchain;
  currency: string; // e.g., "USD" for stablecoins, or token symbol like "USDC"
}

export interface CreateAddressResponse extends CircleResponse {
  data: {
    address: string;
    chain: CircleBlockchain;
    currency: string;
  };
}

// ============ Balance Types ============

export interface TokenBalance {
  token: {
    id: string;
    blockchain: CircleBlockchain;
    symbol: string;
    standard: string;
  };
  amount: string;
  circleCoin: boolean;
}

export interface WalletBalance {
  walletId: string;
  balances: TokenBalance[];
}

export interface GetBalancesResponse extends CircleResponse {
  data: {
    walletId: string;
    balances: TokenBalance[];
  };
}

// ============ Transfer Types ============

export type TransferType = 'CONTRACT' | 'WALLET';

export type TransferStatus = 'PENDING' | 'COMPLETE' | 'FAILED';

export interface TransferAmount {
  amount: string;
  currency: string; // e.g., "USDC"
}

export interface CreateTransferRequest {
  idempotencyKey: string;
  walletId: string;
  destinationAddress: string;
  destinationTag?: string; // For chains like XRP, SOL that use destination tags
  amount: TransferAmount;
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  gasLimit?: string;
}

export interface Transfer {
  id: string;
  sourceWalletId?: string;
  destinationAddress: string;
  destinationTag?: string;
  amount: TransferAmount;
  status: TransferStatus;
  blockchain: CircleBlockchain;
  txHash?: string;
  errorCode?: string;
  errorMessage?: string;
  createDate: string;
  updateDate: string;
}

export interface CreateTransferResponse extends CircleResponse {
  data: Transfer;
}

export interface GetTransferResponse extends CircleResponse {
  data: Transfer;
}

// ============ Deposit Types ============

export interface Deposit {
  id: string;
  walletId: string;
  address: string;
  destinationTag?: string;
  amount: TransferAmount;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  blockchain: CircleBlockchain;
  txHash?: string;
  createDate: string;
  updateDate: string;
}

// ============ Settlement Types ============

export interface SettlementDetails {
  totalDeposits: string;
  totalWithdrawals: string;
  netSettlement: string;
  currency: string;
}

// ============ Master Wallet Types ============

export interface MasterWalletDeposit {
  id: string;
  address: string;
  amount: TransferAmount;
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  txHash?: string;
  createDate: string;
}
