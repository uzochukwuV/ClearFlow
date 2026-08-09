// Base Sepolia configuration for ClearFlow.
//
// All wallet operations target Base Sepolia. USDC is the 6-decimal ERC20 at
// the address below. The admin/deal wallets are Circle developer-controlled
// wallets on this chain (blockchain id BASE-SEPOLIA in Circle's API).

export const MONAD_TESTNET = {
  chainId: 84532, // hex form for MetaMask: 0x14a34
  chainIdHex: '0x14a34',
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

// USDC on Base Sepolia (6 decimals).
export const USDC = {
  address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  decimals: 6,
  symbol: 'USDC',
};

// Minimal ERC20 ABI for balance reads.
export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

// EIP-712 domain — MUST match src/utils/eip712.ts on the backend so signatures
// verify. The chainId is filled at sign time with the connected wallet's chain.
export const CLEARFLOW_DOMAIN = {
  name: 'ClearFlow',
  version: '1',
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

// EIP-712 type definition for a Purchase Order. Matches the backend's
// `PurchaseOrder` struct in createPOSigningData() exactly.
export const PO_TYPES = {
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
};

// The canonical PO shape the backend expects (src/utils/eip712.ts CanonicalPO).
export function buildPOTypedData(po, chainId) {
  return {
    domain: {
      name: CLEARFLOW_DOMAIN.name,
      version: CLEARFLOW_DOMAIN.version,
      chainId,
      verifyingContract: CLEARFLOW_DOMAIN.verifyingContract,
    },
    types: PO_TYPES,
    primaryType: 'PurchaseOrder',
    message: {
      poReference: po.poReference,
      buyerAddress: po.buyerAddress,
      supplierAddress: po.supplierAddress,
      amount: po.amount,
      currency: po.currency,
      quantity: po.quantity,
      deliveryDate: po.deliveryDate,
      chainId,
    },
  };
}
