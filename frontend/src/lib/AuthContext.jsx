import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useWalletOptional } from '@/lib/wallet';

// AuthContext — wallet-based auth + A-Pass (onboarding) gate.
//
// The ClearFlow backend has no email/password. A "session" is a connected
// wallet (EOA via MetaMask). Identity onboarding (A-Pass KYC) is verified by
// the Onboarding page via POST /identity/onboard + /identity/status.
//
// This context bridges the wallet provider (connection + signing) with a
// "current user" record: { address, clearflowRole, onboarded }.
//
// Auth gate logic:
//   - isAuthenticated = wallet connected AND onboarded (persisted flag).
//   - The Onboarding page performs the real signed /identity/status check and
//     sets `onboarded` on success. We do NOT auto-sign on every mount (that
//     would spam the MetaMask popup). Instead we trust the persisted flag,
//     which is cleared on disconnect/logout.
//   - ProtectedRoute redirects: no wallet → /login; wallet but not onboarded →
//     /onboarding.

const AuthContext = createContext();
const USER_KEY = 'clearflow_user';

function loadUser() {
  try {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return null;
}

function saveUser(u) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export const AuthProvider = ({ children }) => {
  const wallet = useWalletOptional();
  const address = wallet?.address ?? null;
  const walletRole = wallet?.role ?? null;
  const [user, setUser] = useState(loadUser);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Finish initial load after first render.
  useEffect(() => {
    setIsLoadingAuth(false);
  }, []);

  // When the wallet address changes, sync the user record + onboarded state.
  useEffect(() => {
    if (!address) {
      // Wallet disconnected — clear auth (but keep role in wallet provider).
      setUser(null);
      saveUser(null);
      return;
    }
    setUser((prev) => {
      // Preserve onboarded flag if the same wallet reconnects; otherwise reset.
      const sameWallet = prev?.address === address;
      const next = {
        address,
        clearflowRole: walletRole || prev?.clearflowRole,
        onboarded: sameWallet ? prev?.onboarded : false,
        apassId: sameWallet ? prev?.apassId : undefined,
        apassStatus: sameWallet ? prev?.apassStatus : undefined,
        apassTier: sameWallet ? prev?.apassTier : undefined,
      };
      saveUser(next);
      return next;
    });
  }, [address, walletRole]);

  // Mark the user as onboarded — called by the Onboarding page after a
  // successful /identity/onboard + /identity/status (ACTIVE) flow.
  const markOnboarded = useCallback(
    (apassInfo) => {
      setUser((prev) => {
        const next = {
          ...prev,
          address: prev?.address,
          onboarded: true,
          apassId: apassInfo?.apassId || prev?.apassId,
          apassStatus: apassInfo?.status || prev?.apassStatus || 'ACTIVE',
          apassTier: apassInfo?.tier ?? prev?.apassTier,
        };
        saveUser(next);
        return next;
      });
    },
    []
  );

  // Clear onboarded flag — e.g. if a status check reveals the A-Pass is no
  // longer active (frozen / expired).
  const clearOnboarded = useCallback(() => {
    setUser((prev) => {
      const next = { ...prev, onboarded: false, apassStatus: undefined };
      saveUser(next);
      return next;
    });
  }, []);

  // Re-check is triggered by ProtectedRoute on mount. We do NOT sign here —
  // just read persisted state. The Onboarding page does the signed check.
  const checkUserAuth = useCallback(async () => {
    return !!address && !!user?.onboarded;
  }, [address, user?.onboarded]);

  const logout = useCallback(() => {
    setUser(null);
    saveUser(null);
  }, []);

  const isAuthenticated = !!address && !!user?.onboarded;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError,
        authChecked: !isLoadingAuth,
        appPublicSettings: null,
        setUser,
        markOnboarded,
        clearOnboarded,
        checkUserAuth,
        navigateToLogin: () => {
          if (typeof window !== 'undefined') window.location.href = '/login';
        },
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
