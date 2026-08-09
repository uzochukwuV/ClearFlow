// React Query hooks for all ClearFlow resources.
//
// Usage:
//   const { data: deals } = useOpenDeals();
//   const contribute = useContributeToDeal();
//   await contribute.mutateAsync({ dealId, amount, signer });
//
// Signed queries (getMyPositions, getClaimableClaims) need the wallet signer,
// passed at call time via mutateAsync/query — they are wrapped as mutations to
// avoid re-signing on every refetch. Unsigned list/detail queries use normal
// useQuery with sensible cache keys.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as circle from './resources/circle';
import * as identity from './resources/identity';
import * as purchaseOrders from './resources/purchaseOrders';
import * as deals from './resources/deals';
import * as portfolio from './resources/portfolio';
import * as dashboard from './resources/dashboard';

const q = (key, fn, options) => useQuery({ queryKey: key, queryFn: fn, ...options });
const m = (fn, options) => useMutation({ mutationFn: fn, ...options });

// ---- Circle ----
export const useCircleHealth = (options) => q(['circle', 'health'], () => circle.circleHealth(), options);
export const useCircleWallet = (walletId, options) =>
  q(['circle', 'wallet', walletId], () => circle.getCircleWallet(walletId), { enabled: !!walletId, ...options });
export const useCircleWalletBalances = (walletId, options) =>
  q(['circle', 'balances', walletId], () => circle.getCircleWalletBalances(walletId), {
    enabled: !!walletId,
    refetchInterval: 15000,
    ...options,
  });
export const useCircleWalletAddress = (walletId, options) =>
  q(['circle', 'address', walletId], () => circle.getCircleWalletAddress(walletId), { enabled: !!walletId, ...options });
export const useCircleTransfer = (transferId, options) =>
  q(['circle', 'transfer', transferId], () => circle.getCircleTransfer(transferId), {
    enabled: !!transferId,
    refetchInterval: 10000,
    ...options,
  });
export const useDealWalletOnChainBalances = (walletId, options) =>
  q(['circle', 'onchain-balances', walletId], () => circle.getDealWalletOnChainBalances(walletId), {
    enabled: !!walletId,
    refetchInterval: 10000,
    ...options,
  });

// ---- Identity ----
export const useOnboardIdentity = () => m(({ params, signer }) => identity.onboardIdentity(params, signer));
export const useIdentityStatus = () => m(({ walletAddress, signer }) => identity.getIdentityStatus(walletAddress, signer));
export const useCheckEligibility = () => m(({ walletAddress, dealId, signer }) => identity.checkEligibility(walletAddress, dealId, signer));
export const useFreezeIdentity = () => m((walletAddress) => identity.freezeIdentity(walletAddress));
export const useUnfreezeIdentity = () => m((walletAddress) => identity.unfreezeIdentity(walletAddress));

// ---- Purchase Orders ----
export const useBuyerPOs = (buyerAddress, options) =>
  q(['pos', 'buyer', buyerAddress], () => purchaseOrders.listBuyerPOs(buyerAddress), { enabled: !!buyerAddress, ...options });
export const useSupplierPOs = (supplierAddress, options) =>
  q(['pos', 'supplier', supplierAddress], () => purchaseOrders.listSupplierPOs(supplierAddress), {
    enabled: !!supplierAddress,
    ...options,
  });
export const usePurchaseOrder = (poId, options) =>
  q(['pos', poId], () => purchaseOrders.getPurchaseOrder(poId), { enabled: !!poId, ...options });
export const useCreatePurchaseOrder = () => {
  const qc = useQueryClient();
  return m(({ po, eip712Signer }) => purchaseOrders.createPurchaseOrder(po, eip712Signer), {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos'] }),
  });
};
export const useSignPurchaseOrder = () => {
  const qc = useQueryClient();
  return m(
    ({ poId, po, authSigner, eip712Signer }) =>
      purchaseOrders.signPurchaseOrderEndpoint(poId, po, authSigner, eip712Signer),
    { onSuccess: () => qc.invalidateQueries({ queryKey: ['pos'] }) }
  );
};

// ---- Deals ----
export const useOpenDeals = (options) => q(['deals', 'open'], () => deals.listOpenDeals(), options);
export const useDeal = (dealId, signer, options) =>
  q(['deals', dealId], () => deals.getDeal(dealId, signer), { enabled: !!dealId && !!signer, ...options });
export const useDealTimeline = (dealId, options) =>
  q(['deals', dealId, 'timeline'], () => deals.getDealTimeline(dealId), { enabled: !!dealId, ...options });
export const useDealSummary = (dealId, options) =>
  q(['deals', dealId, 'summary'], () => deals.getDealSummary(dealId), { enabled: !!dealId, ...options });
export const useDealStatus = (dealId, options) =>
  q(['deals', dealId, 'status'], () => deals.getDealStatus(dealId), { enabled: !!dealId, ...options });
export const useInvestorDealPosition = (dealId, investorAddress, signer, options) =>
  q(['deals', dealId, 'investor', investorAddress], () => deals.getInvestorDealPosition(dealId, investorAddress, signer), {
    enabled: !!dealId && !!investorAddress && !!signer,
    ...options,
  });
export const useBuyerDeals = (buyerAddress, options) =>
  q(['deals', 'buyer', buyerAddress], () => deals.listBuyerDeals(buyerAddress), { enabled: !!buyerAddress, ...options });
export const useSupplierDeals = (supplierAddress, options) =>
  q(['deals', 'supplier', supplierAddress], () => deals.listSupplierDeals(supplierAddress), {
    enabled: !!supplierAddress,
    ...options,
  });
export const useCreateDeal = () => {
  const qc = useQueryClient();
  return m(({ deal, signer }) => deals.createDeal(deal, signer), {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });
};
export const useContributeToDeal = () => {
  const qc = useQueryClient();
  return m(({ dealId, investorAddress, params, signer }) => deals.contributeToDeal(dealId, investorAddress, params, signer), {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });
};
export const useVerifyContribution = () =>
  m((contributionId) => deals.verifyContribution(contributionId));
export const useContribution = (contributionId, options) =>
  q(['contribution', contributionId], () => deals.getContribution(contributionId), {
    enabled: !!contributionId,
    refetchInterval: 10000,
    ...options,
  });

// ---- Settlement ----
export const useSettleDeal = () => m((dealId) => deals.settleDeal(dealId));
export const useReleasePayout = () =>
  m(({ dealId, supplierSigner, amount, poId }) => deals.releasePayout(dealId, supplierSigner, amount, poId));
export const useConfirmDelivery = () =>
  m(({ dealId, confirmerAddress, confirmerType }) => deals.confirmDelivery(dealId, confirmerAddress, confirmerType));
export const useBuyerConfirmDelivery = () =>
  m(({ dealId, signer }) => deals.buyerConfirmDelivery(dealId, signer));
export const useRepayDeal = () => m(({ dealId, amount, fromAddress, txHash }) => deals.repayDeal(dealId, amount, fromAddress, txHash));
export const useBuyerRepayDeal = () =>
  m(({ dealId, signer, txHash }) => deals.buyerRepayDeal(dealId, signer, txHash));
export const useRefundDeal = () => m((dealId) => deals.refundDeal(dealId));
export const useDistributeDeal = () => m((dealId) => deals.distributeDeal(dealId));
export const useCanSettleDeal = (dealId, options) =>
  q(['deals', dealId, 'can-settle'], () => deals.canSettleDeal(dealId), { enabled: !!dealId, ...options });
export const useDealPayouts = (dealId, options) =>
  q(['deals', dealId, 'payouts'], () => deals.getDealPayouts(dealId), { enabled: !!dealId, ...options });

// ---- Portfolio / Claims ----
export const useMyPositions = () => m(({ signer, walletAddress }) => portfolio.getMyPositions(signer, walletAddress));
export const useClaimableClaims = () => m(({ investorAddress, signer }) => portfolio.getClaimableClaims(investorAddress, signer));
export const useClaimDealProceeds = () => m(({ dealId, investorAddress, signer }) => portfolio.claimDealProceeds(dealId, investorAddress, signer));

// ---- Dashboard / Ramp ----
export const useAdminDashboard = (adminAddress, options) =>
  q(['dashboard', 'admin', adminAddress], () => dashboard.getAdminDashboard(adminAddress), { enabled: !!adminAddress, ...options });
export const useSupplierDashboard = (supplierAddress, options) =>
  q(['dashboard', 'supplier', supplierAddress], () => dashboard.getSupplierDashboard(supplierAddress), {
    enabled: !!supplierAddress,
    ...options,
  });
export const useInvestorHoldings = (investorAddress, options) =>
  q(['portfolio', 'holdings', investorAddress], () => dashboard.getInvestorHoldings(investorAddress), {
    enabled: !!investorAddress,
    ...options,
  });
export const useRampQuote = () => m((params) => dashboard.getRampQuote(params));
export const useRampWidget = () => m((params) => dashboard.getRampWidget(params));
export const useRampOrder = (orderId, options) =>
  q(['ramp', 'order', orderId], () => dashboard.getRampOrder(orderId), { enabled: !!orderId, ...options });
export const useSupportedCountries = (options) =>
  q(['ramp', 'countries'], () => dashboard.getSupportedCountries(), options);
export const useSupportedCurrencies = (options) =>
  q(['ramp', 'currencies'], () => dashboard.getSupportedCurrencies(), options);
export const useDealFundingSummary = (dealId, options) =>
  q(['funding', 'summary', dealId], () => dashboard.getDealFundingSummary(dealId), { enabled: !!dealId, ...options });
export const useDealFundingEvents = (dealId, options) =>
  q(['funding', 'events', dealId], () => dashboard.getDealFundingEvents(dealId), { enabled: !!dealId, ...options });

// Re-export raw resources for pages that need direct access.
export { circle, identity, purchaseOrders, deals, portfolio, dashboard };
