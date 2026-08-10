// Wallet signing utilities — real MetaMask + ethers v6.
//
// These functions talk to `window.ethereum` (the injected EIP-1193 provider
// from MetaMask / compatible wallets). They produce real EIP-191 (personal_sign)
// and EIP-712 (eth_signTypedData_v4) signatures that the ClearFlow backend
// verifies with ethers.verifyMessage / ethers.verifyTypedData.
//
// The backend recovers the signer with:
//   recoverSigner(message, signature) → ethers.verifyMessage(message, signature)
// so the frontend MUST sign the RAW message string (personal_sign), NOT a hash.
// ethers/verifyMessage applies the EIP-191 prefix ("\x19Ethereum Signed Message:\n")
// on both sides, so they stay in sync.
//
// For PO signing (EIP-712), the typed-data structure MUST match the backend's
// createPOSigningData() in src/utils/eip712.ts — see src/lib/chains.js.

import { ethers } from 'ethers';
import { MONAD_TESTNET, buildPOTypedData } from './chains';

const EIP1193_PROVIDER = () => {
  if (typeof window === 'undefined') return null;
  if (window.ethereum) return window.ethereum;
  // Some wallets inject under alternative names.
  if (window.provider) return window.provider;
  return null;
};

export function hasWallet() {
  return !!EIP1193_PROVIDER();
}

// Get the raw injected provider (for direct rpc calls if ever needed).
export function getInjectedProvider() {
  return EIP1193_PROVIDER();
}

// Request the connected accounts. Triggers the MetaMask popup if not connected.
export async function requestAccounts() {
  const p = EIP1193_PROVIDER();
  if (!p) throw new Error('No wallet found. Install MetaMask.');
  const accounts = await p.request({ method: 'eth_requestAccounts' });
  return accounts || [];
}

// Current accounts without prompting (empty if locked/not connected).
export async function getAccounts() {
  const p = EIP1193_PROVIDER();
  if (!p) return [];
  try {
    const accounts = await p.request({ method: 'eth_accounts' });
    return accounts || [];
  } catch {
    return [];
  }
}

// Ensure the wallet is on Base Sepolia. Switch (or add) the chain if needed.
export async function ensureMonadTestnet() {
  const p = EIP1193_PROVIDER();
  if (!p) throw new Error('No wallet found.');
  const chainId = await p.request({ method: 'eth_chainId' });
  if (chainId === MONAD_TESTNET.chainIdHex) return MONAD_TESTNET.chainId;

  try {
    await p.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_TESTNET.chainIdHex }],
    });
  } catch (switchError) {
    // 4902: chain not added to wallet → add it.
    if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      await p.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: MONAD_TESTNET.chainIdHex,
            chainName: MONAD_TESTNET.name,
            nativeCurrency: MONAD_TESTNET.nativeCurrency,
            rpcUrls: MONAD_TESTNET.rpcUrls,
            blockExplorerUrls: MONAD_TESTNET.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
  return MONAD_TESTNET.chainId;
}

// Sign an EIP-191 message (personal_sign). Returns a 0x-prefixed 132-char
// signature (65 bytes: r+s+v) recoverable via ethers.verifyMessage(message, sig).
//
// `message` is a UTF-8 string. The backend auth messages are all plain strings
// (ONBOARD:..., SIGN_PO:..., CONTRIBUTE:..., STATUS:..., ELIGIBILITY:...).
export async function signMessage(message, account) {
  const p = EIP1193_PROVIDER();
  if (!p) throw new Error('No wallet found.');
  if (!account) {
    const [acc] = await requestAccounts();
    account = acc;
  }
  const sig = await p.request({
    method: 'personal_sign',
    params: [message, account],
  });
  return sig;
}

// Sign EIP-712 typed data using ethers v6. Used for Purchase Order
// signing. `typedData` must match the backend's createPOSigningData() exactly
// (see buildPOTypedData in chains.js).
export async function signTypedData(typedData, account) {
  const p = EIP1193_PROVIDER();
  if (!p) throw new Error('No wallet found.');

  const provider = new ethers.BrowserProvider(p);
  const signer = account ? await provider.getSigner(account) : await provider.getSigner();
  const signerAddress = await signer.getAddress();

  console.debug('[signing.js] Signing typed data with ethers signer', {
    account: account || signerAddress,
    signerAddress,
    typedData,
  });

  return signer.signTypedData(typedData.domain, typedData.types, typedData.message);
}

// Convenience: sign a Purchase Order (EIP-712). `po` is the CanonicalPO shape
// { poReference, buyerAddress, supplierAddress, amount, currency, quantity,
//   deliveryDate }. chainId defaults to Base Sepolia (10143).
export async function signPurchaseOrder(po, account, chainId = MONAD_TESTNET.chainId) {
  const typedData = buildPOTypedData(po, chainId);
  return signTypedData(typedData, account);
}

// ---- Address / signature helpers (pure, no wallet needed) ----

export function isAddress(addr) {
  return ethers.isAddress(addr);
}

export function checksumAddress(addr) {
  return ethers.getAddress(addr);
}

// Recover the signer of an EIP-191 message — mirrors the backend's recoverSigner.
export function recoverSigner(message, signature) {
  try {
    return ethers.verifyMessage(message, signature);
  } catch {
    return null;
  }
}

// Recover the signer of an EIP-712 PO signature ? mirrors backend recoverPOSigner.
export function recoverPOSigner(po, signature, chainId = MONAD_TESTNET.chainId) {
  try {
    const typedData = buildPOTypedData(po, chainId);
    console.debug('[signing.js] Recovering signer for typed data', typedData, 'signature:', signature);
    return ethers.verifyTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
      signature
    );
  } catch (error) {
    console.debug('[signing.js] recoverPOSigner failed', error);
    return null;
  }
}

export function shortAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Build the auth message strings the backend expects. These mirror
// AuthService.generate*Message() so timestamps and format match on verify.
// The backend parses <ACTION>:<params>:<timestamp> and checks the timestamp
// window, so always sign a freshly-generated message.
export const authMessages = {
  onboard: () => `ONBOARD:${Date.now()}`,
  status: (walletAddress) => `STATUS:wallet:${walletAddress}:${Date.now()}`,
  signPO: (poId, signerType) => `SIGN_PO:poId:${poId},signerType:${signerType}:${Date.now()}`,
  contribute: (dealId, amount) =>
    `CONTRIBUTE:amount:${amount},dealId:${dealId}:${Date.now()}`,
  eligibility: (walletAddress, dealId) =>
    `ELIGIBILITY:dealId:${dealId},wallet:${walletAddress}:${Date.now()}`,
  // Deal creation (buyer). Backend verifies via verifySignature — plain EIP-191.
  createDeal: (purchaseOrderId) => `CREATE_DEAL:poId:${purchaseOrderId}:${Date.now()}`,
  // Settlement actions (buyer). Backend reads signature+message from body.
  confirmDelivery: (dealId) => `CONFIRM_DELIVERY:dealId:${dealId}:${Date.now()}`,
  repay: (dealId, amount) => `REPAY:dealId:${dealId},amount:${amount}:${Date.now()}`,
  // Settlement payout release (supplier). Backend reads from body.
  releasePayout: (dealId, amount) =>
    `RELEASE_PAYOUT:dealId:${dealId},amount:${amount}:${Date.now()}`,
};
