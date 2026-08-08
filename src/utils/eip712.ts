import { ethers } from 'ethers';

/**
 * EIP-712 Typed Data Structures for ClearFlow
 */

// Domain separator for ClearFlow
export const CLEARFLOW_DOMAIN = {
  name: 'ClearFlow',
  version: '1',
  chainId: 84532, // Base Goerli - change for mainnet
  verifyingContract: '0x0000000000000000000000000000000000000000', // Will be set per deployment
};

/**
 * Canonical PO for signing
 */
export interface CanonicalPO {
  poReference: string;
  buyerAddress: string;
  supplierAddress: string;
  amount: string;
  currency: string;
  quantity: number;
  deliveryDate: string;
}

/**
 * Create EIP-712 typed data for PO signing
 * Note: EIP712Domain is implicitly defined by ethers v6
 */
export function createPOSigningData(po: CanonicalPO, chainId: number = 84532) {
  return {
    domain: {
      name: CLEARFLOW_DOMAIN.name,
      version: CLEARFLOW_DOMAIN.version,
      chainId,
      verifyingContract: CLEARFLOW_DOMAIN.verifyingContract,
    },
    types: {
      PurchaseOrder: [
        { name: 'poReference', type: 'string' },
        { name: 'buyerAddress', type: 'address' },
        { name: 'supplierAddress', type: 'address' },
        { name: 'amount', type: 'string' },
        { name: 'currency', type: 'string' },
        { name: 'quantity', type: 'uint256' },
        { name: 'deliveryDate', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
    },
    primaryType: 'PurchaseOrder',
    message: {
      ...po,
      quantity: po.quantity,
      chainId,
    },
  };
}

/**
 * Verify EIP-712 signature for PO
 */
export function verifyPOSignature(
  po: CanonicalPO,
  signature: string,
  expectedSigner: string,
  chainId: number = 84532
): boolean {
  try {
    const typedData = createPOSigningData(po, chainId);
    const recovered = ethers.verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      signature
    );
    return recovered.toLowerCase() === expectedSigner.toLowerCase();
  } catch (error) {
    console.error('EIP-712 verification failed:', error);
    return false;
  }
}

/**
 * Recover signer from EIP-712 signature
 */
export function recoverPOSigner(
  po: CanonicalPO,
  signature: string,
  chainId: number = 84532
): string | null {
  try {
    const typedData = createPOSigningData(po, chainId);
    return ethers.verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      signature
    );
  } catch (error) {
    console.error('EIP-712 recovery failed:', error);
    return null;
  }
}

/**
 * Generate PO hash (for storage/lookup)
 */
export function generatePOHash(po: CanonicalPO): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(po))
  );
}

/**
 * Sign PO intent message (for CREATE_PO action)
 */
export function createIntentMessage(action: string, params: Record<string, string>): string {
  const timestamp = Date.now();
  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `${action}:${paramString}:${timestamp}`;
}

/**
 * Verify intent signature (for CREATE_PO action)
 */
export function verifyIntentSignature(
  message: string,
  signature: string
): string | null {
  try {
    return ethers.verifyMessage(message, signature);
  } catch {
    return null;
  }
}
