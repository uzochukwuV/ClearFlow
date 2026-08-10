// Deals resource — creation, discovery, detail, contributions, settlement.
//
// Creating a deal references an already-signed PO. The backend requires an
// EIP-191 auth signature (signature + message) in the body to verify the buyer.
// Contributing requires an investor EIP-191 signature. Admin approval signatures
// are OPTIONAL — the backend signs server-side with the Circle admin wallet.

import { get, post } from '../client';
import { authMessages } from '../../lib/signing';
import { MONAD_TESTNET } from '../../lib/chains';

// Discover open deals (investor view). No auth.
export function listOpenDeals() {
  return get('/deals-discovery/open');
}

// Get a single deal by ID. The backend GET /deals/:id requires a signature
// query param, so this is a signed fetch.
// `signer` = useWallet().sign (EIP-191).
export async function getDeal(dealId, signer) {
  const message = `GET_DEAL:dealId:${dealId}:${Date.now()}`;
  const signature = await signer(message);
  return get(`/deals/${dealId}`, {
    params: { signature, message },
  });
}

// Deal timeline (DealEvent + SettlementEvent unified). No auth.
export function getDealTimeline(dealId) {
  return get(`/deals-discovery/${dealId}/timeline`);
}

// Deal summary (totals, investor count, status). No auth.
export function getDealSummary(dealId) {
  return get(`/deals-discovery/${dealId}/summary`);
}

// Deal status. No auth.
export function getDealStatus(dealId) {
  return get(`/deals-discovery/${dealId}/status`);
}

// An investor's position in a deal. Signed (investor auth).
export async function getInvestorDealPosition(dealId, investorAddress, signer) {
  const message = authMessages.eligibility(investorAddress, dealId);
  const signature = await signer(message);
  return get(`/deals/${dealId}/investor/${investorAddress}`, {
    params: { signature, message },
  });
}

// Create a deal from a signed PO.
// `deal` = { purchaseOrderId, targetAmount, yieldPercent, fundingDeadline,
//            deliveryDeadline?, eligibleCountries?, minInvestorTier? }.
// `signer` = useWallet().sign (EIP-191 over the createDeal message).
export async function createDeal(deal, signer) {
  const message = authMessages.createDeal(deal.purchaseOrderId);
  const signature = await signer(message);
  return post('/deals', {
    signature,
    message,
    purchaseOrderId: deal.purchaseOrderId,
    targetAmount: deal.targetAmount,
    yieldPercent: deal.yieldPercent,
    fundingDeadline: deal.fundingDeadline,
    deliveryDeadline: deal.deliveryDeadline,
    minInvestorTier: deal.minInvestorTier ?? 1,
    eligibleCountries: deal.eligibleCountries ?? [],
    chainId: deal.chainId || MONAD_TESTNET.chainId,
  });
}

// Contribute USDC to a deal as an investor.
// `params` = { amount, paymentMethod: 'CRYPTO'|'FIAT', fiatCurrency?,
//   partnerCustomerId?, mintTokensOnConfirm? }.
// `signer` = useWallet().sign (EIP-191 over the contribute message).
// NO admin signature is sent — the backend signs as the Circle admin wallet.
export async function contributeToDeal(dealId, investorAddress, params, signer) {
  const message = authMessages.contribute(dealId, params.amount);
  const signature = await signer(message);
  return post(`/deals/${dealId}/contribute`, {
    investorSignature: signature,
    investorMessage: message,
    investorAddress,
    amount: String(params.amount),
    paymentMethod: params.paymentMethod || 'CRYPTO',
    fiatCurrency: params.fiatCurrency,
    partnerCustomerId: params.partnerCustomerId,
    mintTokensOnConfirm: params.mintTokensOnConfirm,
    chainId: params.chainId || MONAD_TESTNET.chainId,
  });
}

// Verify a contribution (after the investor's on-chain USDC transfer).
export function verifyContribution(contributionId) {
  return post(`/funding/contributions/${contributionId}/verify`);
}

// Get a contribution's status (poll after funding).
export function getContribution(contributionId) {
  return get(`/funding/contributions/${contributionId}`);
}

// ---- Settlement actions ----
// All settlement routes are mounted under /settlement/deals/:dealId/...
// Buyer actions (confirmDelivery, repay) require an EIP-191 signature in body.
// Payout-release requires a supplier signature. Admin signs server-side.

// Buyer confirms delivery of goods. Signed (buyer auth).
export async function buyerConfirmDelivery(dealId, signer) {
  const message = authMessages.confirmDelivery(dealId);
  const signature = await signer(message);
  return post(`/settlement/deals/${dealId}/buyer-confirm-delivery`, {
    signature,
    message,
  });
}

// Supplier / generic confirm-delivery (no signature required by the generic
// endpoint — it takes confirmerAddress + confirmerType in body).
export function confirmDelivery(dealId, confirmerAddress, confirmerType) {
  return post(`/settlement/deals/${dealId}/confirm-delivery`, {
    confirmerAddress,
    confirmerType,
  });
}

// Buyer repays principal + yield. Signed (buyer auth).
export async function buyerRepayDeal(dealId, signer, txHash) {
  const message = authMessages.repay(dealId, '0'); // amount computed server-side
  const signature = await signer(message);
  return post(`/settlement/deals/${dealId}/buyer-repay`, {
    signature,
    message,
    txHash,
  });
}

// Supplier releases payout. Signed (supplier auth).
// Backend requires supplierSignature + supplierMessage + amount + poId in body.
export async function releasePayout(dealId, supplierSigner, amount, poId) {
  const message = authMessages.releasePayout(dealId, amount);
  const signature = await supplierSigner(message);
  return post(`/settlement/deals/${dealId}/payout-release`, {
    supplierSignature: signature,
    supplierMessage: message,
    amount,
    poId,
  });
}

// Admin records a repayment manually (amount + fromAddress in body, no sig).
export function repayDeal(dealId, amount, fromAddress, txHash) {
  return post(`/settlement/deals/${dealId}/repay`, { amount, fromAddress, txHash });
}

// Admin-only settlement actions (backend signs as admin server-side, no client sig).
export function settleDeal(dealId) {
  return post(`/settlement/deals/${dealId}/settle`);
}
export function distributeDeal(dealId) {
  return post(`/settlement/deals/${dealId}/distribute`);
}
export function refundDeal(dealId) {
  return post(`/settlement/deals/${dealId}/refund`);
}
export function canSettleDeal(dealId) {
  return post(`/settlement/deals/${dealId}/can-settle`);
}
export function getDealPayouts(dealId) {
  return get(`/settlement/deals/${dealId}/payouts`);
}

// Buyer's deals (no auth — filtered by walletAddress).
export function listBuyerDeals(buyerAddress) {
  return get(`/deals-discovery/buyer/${buyerAddress}`);
}
// Supplier's deals (no auth — filtered by walletAddress).
export function listSupplierDeals(supplierAddress) {
  return get(`/deals-discovery/supplier/${supplierAddress}`);
}
