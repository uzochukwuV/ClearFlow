/**
 * Funding Service Types
 * 
 * Manages deal funding state machine and contribution tracking.
 */

/**
 * Funding state machine states
 */
export enum FundingState {
  /** Deal is open but not yet receiving contributions */
  PENDING = 'PENDING',
  
  /** Deal is actively receiving contributions */
  OPEN = 'OPEN',
  
  /** Deal has received minimum required funding */
  FUNDED = 'FUNDED',
  
  /** Deal has reached its target amount (fully funded) */
  FULLY_FUNDED = 'FULLY_FUNDED',
  
  /** Deal has expired before reaching minimum funding */
  EXPIRED = 'EXPIRED',
  
  /** Deal has been cancelled by admin or buyer */
  CANCELLED = 'CANCELLED',
  
  /** Deal is in settlement phase */
  SETTLEMENT = 'SETTLEMENT',
  
  /** Deal has been completed */
  COMPLETED = 'COMPLETED',
  
  /** Deal has defaulted (supplier didn't deliver) */
  DEFAULTED = 'DEFAULTED',
}

/**
 * Contribution status
 */
export enum ContributionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

/**
 * Funding event types for audit trail
 */
export enum FundingEventType {
  DEAL_OPENED = 'DEAL_OPENED',
  CONTRIBUTION_RECEIVED = 'CONTRIBUTION_RECEIVED',
  CONTRIBUTION_CONFIRMED = 'CONTRIBUTION_CONFIRMED',
  CONTRIBUTION_FAILED = 'CONTRIBUTION_FAILED',
  MINIMUM_FUNDED = 'MINIMUM_FUNDED',
  FULLY_FUNDED = 'FULLY_FUNDED',
  DEAL_EXPIRED = 'DEAL_EXPIRED',
  DEAL_CANCELLED = 'DEAL_CANCELLED',
  SETTLEMENT_STARTED = 'SETTLEMENT_STARTED',
  SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED',
  REPAYMENT_DISTRIBUTED = 'REPAYMENT_DISTRIBUTED',
}

/**
 * Webhook types
 */
export enum WebhookType {
  TRANSFER = 'transfer',
  DEPOSIT = 'deposit',
  PAYMENT = 'payment',
}

/**
 * Circle webhook event
 */
export interface CircleWebhookEvent {
  type: string;
  subscriptionId: string;
  signature: string;
  timestamp: string;
  verificationId: string;
  data: {
    id: string;
    type: string;
    attributes: Record<string, any>;
  };
}

/**
 * Transfer webhook data
 */
export interface TransferWebhookData {
  transferId: string;
  sourceWalletId?: string;
  destinationAddress: string;
  amount: {
    amount: string;
    currency: string;
  };
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  blockchain: string;
  txHash?: string;
}

/**
 * Deposit webhook data
 */
export interface DepositWebhookData {
  depositId: string;
  walletId: string;
  address: string;
  amount: {
    amount: string;
    currency: string;
  };
  status: 'PENDING' | 'COMPLETE' | 'FAILED';
  blockchain: string;
  txHash?: string;
}

/**
 * Contribution with attribution
 */
export interface AttributedContribution {
  contributionId: string;
  dealId: string;
  investorAddress: string;
  amount: string;
  currency: string;
  txHash?: string;
  sourceWalletId?: string;
  confirmedAt?: Date;
  status: ContributionStatus;
}

/**
 * Funding summary for a deal
 */
export interface FundingSummary {
  dealId: string;
  targetAmount: string;
  minimumAmount: string;
  runningTotal: string;
  percentage: number;
  investorCount: number;
  state: FundingState;
  timeRemaining?: number; // ms until expiry
}
