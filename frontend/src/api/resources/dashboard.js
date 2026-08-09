// Dashboard + ramp + funding helpers.

import { get, post, withAuth } from '../client';
import { authMessages } from '../../lib/signing';

// Admin dashboard stats for a wallet.
export function getAdminDashboard(adminAddress) {
  return get(`/dashboard/admin/${adminAddress}`);
}

// Investor's holdings (USDC + A-Tokens) by address.
export function getInvestorHoldings(investorAddress) {
  return get(`/portfolio/investor/${investorAddress}/holdings`);
}

// Investor's contribution history.
export function getInvestorHistory(investorAddress) {
  return get(`/portfolio/investor/${investorAddress}/positions`);
}

// Supplier dashboard.
export function getSupplierDashboard(supplierAddress) {
  return get(`/dashboard/supplier/${supplierAddress}`);
}

// ---- Fiat ramp (Cleanverse) ----
export function getRampQuote(params) {
  return post('/ramp/fiat-ramp/quote', params);
}
export function getRampWidget(params) {
  return post('/ramp/fiat-ramp/widget', params);
}
export function getRampOrder(orderId) {
  return get(`/ramp/fiat-ramp/order/${orderId}`);
}
export function getSupportedCountries() {
  return get('/ramp/countries');
}
export function getSupportedCurrencies() {
  return get('/ramp/currencies');
}

// ---- Funding summary / events ----
export function getDealFundingSummary(dealId) {
  return get(`/funding/deals/${dealId}/summary`);
}
export function getDealFundingEvents(dealId) {
  return get(`/funding/deals/${dealId}/events`);
}
