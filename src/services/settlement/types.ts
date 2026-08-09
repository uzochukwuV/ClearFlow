/**
 * Settlement Service Types
 * 
 * Handles deal lifecycle from funding to completion.
 */

/**
 * Settlement status
 */
export enum SettlementStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  SUPPLIER_PAID = 'SUPPLIER_PAID',
  DELIVERY_PENDING = 'DELIVERY_PENDING',
  DELIVERY_CONFIRMED = 'DELIVERY_CONFIRMED',
  REPAYMENT_PENDING = 'REPAYMENT_PENDING',
  REPAYMENT_RECEIVED = 'REPAYMENT_RECEIVED',
  DISTRIBUTING = 'DISTRIBUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DISPUTED = 'DISPUTED',
}

/**
 * Delivery confirmation status
 */
export enum DeliveryConfirmationStatus {
  PENDING = 'PENDING',
  BUYER_CONFIRMED = 'BUYER_CONFIRMED',
  SUPPLIER_CONFIRMED = 'SUPPLIER_CONFIRMED',
  BOTH_CONFIRMED = 'BOTH_CONFIRMED',
  DISPUTED = 'DISPUTED',
}

/**
 * Repayment status
 */
export enum RepaymentStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  COMPLETE = 'COMPLETE',
  OVERDUE = 'OVERDUE',
  DEFAULTED = 'DEFAULTED',
}

/**
 * Investor payout status
 */
export enum PayoutStatus {
  PENDING = 'PENDING',
  CALCULATING = 'CALCULATING',
  READY = 'READY',
  DISTRIBUTING = 'DISTRIBUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Settlement event types
 */
export enum SettlementEventType {
  SETTLEMENT_INITIATED = 'SETTLEMENT_INITIATED',
  SUPPLIER_PAYMENT_SENT = 'SUPPLIER_PAYMENT_SENT',
  SUPPLIER_PAYMENT_CONFIRMED = 'SUPPLIER_PAYMENT_CONFIRMED',
  DELIVERY_INITIATED = 'DELIVERY_INITIATED',
  DELIVERY_CONFIRMED_BY_BUYER = 'DELIVERY_CONFIRMED_BY_BUYER',
  DELIVERY_CONFIRMED_BY_SUPPLIER = 'DELIVERY_CONFIRMED_BY_SUPPLIER',
  DELIVERY_DISPUTED = 'DELIVERY_DISPUTED',
  REPAYMENT_DUE_DATE_SET = 'REPAYMENT_DUE_DATE_SET',
  REPAYMENT_RECEIVED = 'REPAYMENT_RECEIVED',
  REPAYMENT_PARTIAL = 'REPAYMENT_PARTIAL',
  PAYOUT_CALCULATED = 'PAYOUT_CALCULATED',
  PAYOUT_DISTRIBUTED = 'PAYOUT_DISTRIBUTED',
  SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED',
  SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
}

/**
 * Settlement summary
 */
export interface SettlementSummary {
  dealId: string;
  status: SettlementStatus;
  supplierPaid: boolean;
  supplierPaymentTxHash?: string;
  deliveryConfirmed: boolean;
  repaymentReceived: boolean;
  repaymentAmount?: string;
  repaymentDueDate?: Date;
  totalInvestorPayouts?: string;
  investorCount: number;
  completionPercentage: number;
}

/**
 * Investor payout calculation
 */
export interface InvestorPayoutCalculation {
  investorId: string;
  investorAddress: string;
  contributionAmount: string;
  proportion: number; // Percentage of total funding
  principal: string;
  yieldAmount: string;
  totalPayout: string;
  tokenAmount: string;
}

/**
 * Settlement initiation params
 */
export interface InitiateSettlementParams {
  dealId: string;
  operatorAddress: string;
}

/**
 * Delivery confirmation params
 */
export interface ConfirmDeliveryParams {
  dealId: string;
  confirmerAddress: string;
  confirmerType: 'BUYER' | 'SUPPLIER';
  signature?: string;
  notes?: string;
}

/**
 * Repayment params
 */
export interface RecordRepaymentParams {
  dealId: string;
  amount: string;
  txHash?: string;
  fromAddress: string;
}
