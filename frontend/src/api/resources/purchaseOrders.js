// Purchase Orders resource.
//
// PO creation uses EIP-712 signing (buyer signs the canonical PO terms). The
// backend generates/accepts the canonical PO + hash, the buyer signs with
// eth_signTypedData_v4, then POST /purchase-orders with poSignature.
//
// Supplier signing: POST /purchase-orders/:id/sign with BOTH:
//   - authSignature (EIP-191 over authMessages.signPO) � proves wallet ownership
//   - poSignature (EIP-712 over canonical PO terms) � proves commitment to terms
// The backend reads these from the BODY (signPORequestSchema), not headers.

import { get, post } from '../client';
import { authMessages, recoverPOSigner } from '../../lib/signing';
import { MONAD_TESTNET } from '../../lib/chains';

// List POs created by a buyer (no auth � filtered by walletAddress on the
// backend, same pattern as /deals-discovery/open).
export function listBuyerPOs(buyerAddress) {
  return get(`/purchase-orders/buyer/${buyerAddress}`);
}

// List POs assigned to a supplier (pending their signature).
export function listSupplierPOs(supplierAddress) {
  return get(`/purchase-orders/supplier/${supplierAddress}`);
}

// Get a single PO by ID (no auth � the backend returns the PO record; parties
// are identified by walletAddress on the client).
export function getPurchaseOrder(poId) {
  return get(`/purchase-orders/${poId}`);
}

// Create a PO with a buyer EIP-712 signature.
// `po` = { poReference, buyerAddress, supplierAddress, amount, currency,
//          quantity, deliveryDate }.
// `eip712Signer` = useWallet().signPurchaseOrder (async (po) => signature).
// chainId defaults to Base Sepolia.
export async function createPurchaseOrder(po, eip712Signer, chainId = MONAD_TESTNET.chainId) {
  console.log('[PO:create] signing canonical PO', {
    poReference: po.poReference,
    buyerAddress: po.buyerAddress,
    supplierAddress: po.supplierAddress,
    amount: po.amount,
    currency: po.currency || 'USD',
    quantity: po.quantity,
    deliveryDate: po.deliveryDate,
    chainId,
  });

  const poSignature = await eip712Signer(po);
  const locallyRecovered = recoverPOSigner(po, poSignature, chainId);

  console.log('[PO:create] signature complete', {
    poReference: po.poReference,
    buyerAddress: po.buyerAddress,
    chainId,
    signaturePrefix: poSignature?.slice(0, 18),
    locallyRecovered,
    recoveredMatchesBuyer: locallyRecovered?.toLowerCase() === po.buyerAddress?.toLowerCase(),
  });

  return post('/purchase-orders', {
    poSignature,
    poReference: po.poReference,
    buyerAddress: po.buyerAddress,
    supplierAddress: po.supplierAddress,
    amount: po.amount,
    currency: po.currency || 'USD',
    quantity: po.quantity,
    deliveryDate: po.deliveryDate,
    chainId,
  });
}

// Supplier signs an existing PO. Requires BOTH:
//   - authSignature: EIP-191 over authMessages.signPO(poId, 'SUPPLIER')
//   - poSignature: EIP-712 over the canonical PO terms (same terms buyer signed)
// `po` must include poHash (returned by the list/detail endpoints).
// `authSigner` = useWallet().sign (EIP-191). `eip712Signer` = useWallet().signPurchaseOrder.
export async function signPurchaseOrderEndpoint(poId, po, authSigner, eip712Signer, chainId = MONAD_TESTNET.chainId) {
  const authMessage = authMessages.signPO(poId, 'SUPPLIER');

  console.log('[PO:sign] signing PO', {
    poId,
    poHash: po.poHash,
    chainId,
    poReference: po.poReference,
    buyerAddress: po.buyerAddress,
    supplierAddress: po.supplierAddress,
  });

  const authSignature = await authSigner(authMessage);
  const poSignature = await eip712Signer(po);

  console.log('[PO:sign] signatures ready', {
    poId,
    chainId,
    authSignaturePrefix: authSignature?.slice(0, 18),
    poSignaturePrefix: poSignature?.slice(0, 18),
  });

  return post(`/purchase-orders/${poId}/sign`, {
    poSignature,
    poId,
    poHash: po.poHash,
    chainId,
    authSignature,
    authMessage,
  });
}
