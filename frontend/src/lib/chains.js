// Monad testnet configuration for ClearFlow.
//
// All wallet operations target Monad testnet. USDC is the 6-decimal ERC20 at
// the address below. The admin/deal wallets are Circle developer-controlled
// wallets on this chain (blockchain id MONAD-TESTNET in Circle's API).

export const MONAD_TESTNET = {
  chainId: 10143, // hex form for MetaMask: 0x27bf
  chainIdHex: '0x27bf',
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.ankr.com/monad_testnet', 'https://monad-testnet.drpc.org'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com'],
};

// USDC on Monad testnet (6 decimals).
export const USDC = {
  address: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
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
