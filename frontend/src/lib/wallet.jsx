import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  hasWallet,
  requestAccounts,
  getAccounts,
  ensureMonadTestnet,
  signMessage as _signMessage,
  signPurchaseOrder as _signPurchaseOrder,
  shortAddress,
} from './signing';

const WalletContext = createContext(null);

const STORAGE_KEY = 'clearflow_wallet';
const ROLE_KEY = 'clearflow_role';

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [role, setRoleState] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const restore = useCallback(async () => {
    if (!hasWallet()) return;
    try {
      const accounts = await getAccounts();
      if (accounts.length) {
        setAddress(accounts[0]);
        try {
          const p = window.ethereum;
          const cid = await p.request({ method: 'eth_chainId' });
          setChainId(parseInt(cid, 16));
        } catch {
          /* ignore chain read failure */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const storedRole = localStorage.getItem(ROLE_KEY);
    if (storedRole) setRoleState(storedRole);
    restore();
  }, [restore]);

  useEffect(() => {
    if (!hasWallet()) return;
    const p = window.ethereum;
    const onAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAddress(null);
      } else {
        setAddress(accounts[0]);
      }
    };
    const onChainChanged = (cid) => {
      setChainId(parseInt(cid, 16));
    };
    p.on?.('accountsChanged', onAccountsChanged);
    p.on?.('chainChanged', onChainChanged);
    return () => {
      p.removeListener?.('accountsChanged', onAccountsChanged);
      p.removeListener?.('chainChanged', onChainChanged);
    };
  }, []);

  const setRole = useCallback((r) => {
    setRoleState(r);
    if (r) localStorage.setItem(ROLE_KEY, r);
    else localStorage.removeItem(ROLE_KEY);
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!hasWallet()) {
      const err = new Error('No wallet found. Install MetaMask.');
      setError(err.message);
      throw err;
    }
    setConnecting(true);
    try {
      const accounts = await requestAccounts();
      const addr = accounts[0];
      if (!addr) throw new Error('No account returned by wallet.');
      const cid = await ensureMonadTestnet();
      setChainId(cid);
      setAddress(addr);
      localStorage.setItem(STORAGE_KEY, addr);
      return addr;
    } catch (e) {
      setError(e?.message || 'Failed to connect wallet');
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ROLE_KEY);
    setAddress(null);
    setRoleState(null);
    setChainId(null);
  }, []);

  const sign = useCallback(
    async (message) => {
      if (!address) throw new Error('Wallet not connected.');
      return _signMessage(message, address);
    },
    [address]
  );

  const signPurchaseOrder = useCallback(
    async (po) => {
      const [freshAccount] = await getAccounts();
      const signerAddress = freshAccount || address;
      if (!signerAddress) throw new Error('Wallet not connected.');
      console.debug('[Wallet:signPurchaseOrder] signing PO', {
        walletAddress: signerAddress,
        walletStateAddress: address,
        chainId,
        poReference: po?.poReference,
        buyerAddress: po?.buyerAddress,
        supplierAddress: po?.supplierAddress,
        amount: po?.amount,
        quantity: po?.quantity,
        deliveryDate: po?.deliveryDate,
      });
      return _signPurchaseOrder(po, signerAddress);
    },
    [address, chainId]
  );

  const shortAddr = useCallback((addr) => shortAddress(addr || address), [address]);

  return (
    <WalletContext.Provider
      value={{
        address,
        role,
        setRole,
        chainId,
        connecting,
        error,
        connect,
        disconnect,
        sign,
        signPurchaseOrder,
        shortAddr,
        hasWallet: hasWallet(),
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function useWalletOptional() {
  return useContext(WalletContext);
}
