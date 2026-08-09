// Investor portfolio + claims.

import { get, post, withAuth } from '../client';
import { authMessages } from '../../lib/signing';

// Current investor's positions across all deals (auth by wallet signature).
export async function getMyPositions(signer, walletAddress) {
  const message = authMessages.status(walletAddress);
  const config = await withAuth({}, signer, message);
  return get('/portfolio/my/positions', config);
}

// Claimable contributions for an investor.
export async function getClaimableClaims(investorAddress, signer) {
  const message = authMessages.status(investorAddress);
  const config = await withAuth({}, signer, message);
  return get(`/claims/investor/${investorAddress}`, config);
}

// Claim settlement proceeds for an investor's position in a deal.
export async function claimDealProceeds(dealId, investorAddress, signer) {
  const message = authMessages.contribute(dealId, '0');
  const config = await withAuth({}, signer, message);
  return post(
    `/claims/deals/${dealId}/investor/${investorAddress}/claim`,
    { signature: config.headers['X-Signature'], message },
    undefined
  );
}
