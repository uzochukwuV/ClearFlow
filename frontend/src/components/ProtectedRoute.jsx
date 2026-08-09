import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useWallet } from '@/lib/wallet';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  const { address } = useWallet();
  const location = useLocation();

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  // No wallet connected → redirect to login (or caller's unauthenticated element).
  if (!address) {
    return unauthenticatedElement || <Navigate to="/login" replace />;
  }

  // Wallet connected but not onboarded → redirect to onboarding, unless we're
  // already on the onboarding page (which is the onboarding flow itself).
  if (!isAuthenticated && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}