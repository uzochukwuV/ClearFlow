// Cleanverse API Response Types

export interface CleanverseResponse<T = any> {
  code: string;
  message: string;
  data: T;
}

// ============ A-Pass Types ============

export interface APassIdentityData {
  idType: 'ID_CARD' | 'PASSPORT' | 'DRIVER_LICENSE' | 'HK_MACAO_TAIWAN_PASS' | 'RESIDENCE_PERMIT';
  fullName: string;  // Required by Cleanverse!
  issuingCountryISO2: string;
  idNumber?: string;
  validUntil?: string; // yyyy-MM-dd format
}

export interface GenerateAPassRequest {
  customerId: string;
  kycSource?: string;
  kycId?: string;
  subTier?: number;
  subGroup?: string;
  override?: boolean;
  expirationTime: number;  // Required! Unix timestamp (e.g., 1863690034 = 2029-01-21)
  wallet: {
    address: string;
    chain: string;
  };
  identityDataList?: APassIdentityData[];
  bankAccountList?: Array<{
    bankCountry: string;
    bankName: string;
    bankAccount?: string;
    bankAccountType?: string;
    balance?: number;
    currency?: string;
  }>;
}

export interface APassInfo {
  // Generate A-Pass response fields
  cvRecordId?: string;
  customerId?: string;
  tier?: string;
  countries?: string[];
  wallet?: {
    operate?: string;
    address?: string;
    chain?: string;
    txHash?: string;
    depositUSDCWallet?: string;
    depositUSDCAccount?: string;
    depositUSDTWallet?: string;
    depositUSDTAccount?: string;
    apassAddress?: string;
  };
  // Query A-Pass response fields
  apassId?: string;
  apassAddress?: string;
  chain?: string;
  status?: 'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | number;
  subTier?: number;
  group?: string;
  subGroup?: string;
  expirationTime?: number;
  txHash?: string;
  createdAt?: number;
  updatedAt?: number;
  currentKycHash?: string;
}

export interface UpdateStatusRequest {
  chain: string;
  address: string;
  status: '1' | '2'; // 1 = unfreeze, 2 = freeze
  blacklistReason?: string;
}

// ============ A-Token Types ============

export interface ATokenRule {
  allowed_group?: string;
  allowed_sub_group?: string;
  min_tier?: number;
  min_sub_tier?: number;
  is_black_list?: boolean;
  countries?: string[];
}

export interface LaunchATokenRequest {
  chain: string;
  token_name: string;
  token_symbol: string;
  decimals?: number;
  admin_address: string;
  rule: ATokenRule;
  icon?: string;
  callback_url?: string;
}

export interface ATokenApplication {
  requestId: string;
  applyStatus: 'PENDING' | 'ISSUED' | 'REJECTED';
  txHash?: string;
  atokenAddress?: string;
  callbackUrl?: string;
  callbackStatus?: string;
  callbackAttempts?: number;
  callbackLastError?: string;
}

export interface RegisterATokenRequest {
  chain: string;
  atoken_address: string;
  owner_signature: string;
  atoken_icon: string;
  callback_url?: string;
}

export interface ATokenInfo {
  atokenId: string;
  atokenAddress: string;
  chain: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  status: string;
  createdAt: number;
}

export interface AddRuleRequest {
  chain: string;
  atoken_address: string;
  rule: ATokenRule;
}

export interface SetPausedRequest {
  chain: string;
  atoken_address: string;
  paused: boolean;
}

export interface InstitutionalWhitelistRequest {
  chain: string;
  atoken_address: string;
  address: string;
  txHash?: string;
}

// ============ Validator Types ============

export interface ValidatorPoolRule {
  allowed_group?: string;
  allowed_sub_group?: string;
  min_tier?: number;
  min_sub_tier?: number;
  is_black_list?: boolean;
  countries?: string[];
}

export interface RegisterValidatorRequest {
  chain: string;
  name: string;
  owner_signature: string;
}

export interface VerifyValidatorRequest {
  chain: string;
  address: string;
}

export interface VerifyValidatorResponse {
  valid: boolean;
  tier?: number;
  subTier?: number;
  group?: string;
  subGroup?: string;
  countries?: string[];
}

// ============ Fiat Ramp Types ============

export interface RampCountry {
  code: string;
  name: string;
  isBuy: boolean;
  isSell: boolean;
}

export interface RampFiatCurrency {
  code: string;
  name: string;
  symbol: string;
  iconUrl?: string;
}

export interface RampCryptoCurrency {
  code: string;
  symbol: string;
  chain: string;
  iconUrl?: string;
}

export interface RampPaymentMethod {
  id: string;
  type: string;
  label: string;
  currencies: string[];
  iconUrl?: string;
}

export interface RampQuoteRequest {
  fiatCurrency: string;
  cryptoCurrency: string;
  amount: string;
  isBuyOrSell: 'BUY' | 'SELL';
  network?: string;
  paymentMethod?: string;
  country?: string;
  partnerCustomerId?: string;
}

export interface RampQuote {
  quoteToken: string;
  fiatCurrency: string;
  fiatAmount: string;
  cryptoAmount: string;
  exchangeRate: string;
  fees: string;
  expiresAt: string;
}

export interface CreateRampWidgetRequest {
  quoteToken: string;
  wallet: {
    address: string;
    chain: string;
  };
}

export interface RampWidgetUrl {
  url: string;
  quoteToken: string;
  expiresAt: string;
}

export interface RampOrderRequest {
  orderId?: string;
  quoteToken?: string;
  partnerCustomerId?: string;
}

export interface RampOrder {
  orderId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  fiatCurrency: string;
  fiatAmount: string;
  cryptoCurrency: string;
  cryptoAmount: string;
  exchangeRate: string;
  fees: string;
  createdAt: string;
  updatedAt: string;
  walletAddress: string;
  walletChain: string;
  txHash?: string;
}

// ============ Common Query Types ============

export interface DepositAddressRequest {
  chain: string;
  address: string;
}

export interface DepositAddress {
  address: string;
  chain: string;
  tag?: string;
  memo?: string;
}

export interface TransactionRequest {
  chain?: string;
  address?: string;
  startTime?: number;
  endTime?: number;
  txHash?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

export interface Transaction {
  tx_hash: string;
  blockHash: string;
  blockNumber: number;
  blockTime: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  type: string;
  status: string;
  tokenType: string;
}

export interface InstitutionTransactionRequest {
  chain: string;
  type: 'deposit' | 'withdraw';
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
}

export interface InstitutionTransaction {
  tx_hash: string;
  blockTime: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  type: string;
  status: string;
}

export interface DownloadTravelRuleRequest {
  type: 'TRAVEL_RULE' | 'TRANSACTION_REPORT';
  chain?: string;
  txHash: string;
}

export interface TravelRuleDownload {
  downloadUrl: string;
  fileName: string;
}

export interface FaucetRequest {
  chain: string;
  symbol: string;
  depositAddress: string;
  amount: string;
}

export interface FaucetResponse {
  chain: string;
  symbol: string;
  deposit_address: string;
  amount: string;
  tx_hash: string;
}
