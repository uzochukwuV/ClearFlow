// Identity / A-Pass (Cleanverse KYC) resource.
//
// Onboarding flow:
//   1. User picks a role (userType: BUYER/SUPPLIER/INVESTOR) + KYC fields.
//   2. Sign an EIP-191 message (authMessages.onboard()).
//   3. POST /identity/onboard with { signature, message, chain, userType,
//      customerId, identityDataList }.
//   4. Poll POST /identity/status until A-Pass is active.
//
// All signed calls use the wallet signer from useWallet().sign.

import { get, post, withAuth } from '../client';
import { authMessages } from '../../lib/signing';

// Onboard a wallet as a ClearFlow identity (issues a Cleanverse A-Pass).
// `signer` = async (message) => signature (from useWallet().sign).
export async function onboardIdentity(params, signer) {
  const message = authMessages.onboard();
  const config = await withAuth({}, signer, message);
  return post(
    '/identity/onboard',
    {
      signature: config.headers['X-Signature'],
      message,
      chain: params.chain || 'base',
      userType: params.userType,
      customerId: params.customerId,
      identityDataList: params.identityDataList,
    },
    undefined
  );
}

// Check A-Pass status for a wallet. Requires a signature over the status
// message; the backend verifies the signature matches walletAddress.
export async function getIdentityStatus(walletAddress, signer) {
  const message = authMessages.status(walletAddress);
  const config = await withAuth({}, signer, message);
  return post(
    '/identity/status',
    { signature: config.headers['X-Signature'], message, walletAddress },
    undefined
  );
}

// Check eligibility of a wallet for a deal (A-Pass tier/country rules).
export async function checkEligibility(walletAddress, dealId, signer) {
  const message = authMessages.eligibility(walletAddress, dealId);
  const config = await withAuth({}, signer, message);
  return post(
    '/identity/eligibility',
    { signature: config.headers['X-Signature'], message, walletAddress, dealId },
    undefined
  );
}

// Freeze / unfreeze an A-Pass (admin action — backend signs as admin).
export function freezeIdentity(walletAddress) {
  return post('/identity/freeze', { walletAddress });
}
export function unfreezeIdentity(walletAddress) {
  return post('/identity/unfreeze', { walletAddress });
}
