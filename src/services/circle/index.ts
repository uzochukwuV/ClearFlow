/**
 * Circle Wallet Service
 * 
 * Manages Circle developer wallets for ClearFlow deals.
 * 
 * Key operations:
 * - Create deal wallet (one per financing deal)
 * - Get deposit address for investors to send USDC
 * - Transfer to supplier
 * - Distribute repayment to investors
 * 
 * Docs: https://developers.circle.com/wallets
 */

export * from './types';
export * from './client';
export * from './wallet.service';
export * from './entity-secret.service';
