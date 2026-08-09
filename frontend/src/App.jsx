import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { WalletProvider } from '@/lib/wallet';
import AppLayout from '@/components/AppLayout';
// Public + onboarding
import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Unified dashboard
import Dashboard from '@/pages/Dashboard';
// Orders
import PurchaseOrders from '@/pages/orders/PurchaseOrders';
import CreatePO from '@/pages/orders/CreatePO';
import OrderDetail from '@/pages/orders/OrderDetail';
import SupplierOrders from '@/pages/orders/SupplierOrders';
// Deals
import MyDeals from '@/pages/deals/MyDeals';
import CreateDeal from '@/pages/deals/CreateDeal';
import DealDetail from '@/pages/deals/DealDetail';
import Discover from '@/pages/deals/Discover';
import Contribute from '@/pages/deals/Contribute';
import AdminDeals from '@/pages/deals/AdminDeals';
import AdminDealDetail from '@/pages/deals/AdminDealDetail';
// Investor
import Portfolio from '@/pages/investor/Portfolio';
import Claims from '@/pages/investor/Claims';
// Supplier
import Payouts from '@/pages/supplier/Payouts';


const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-secondary border-t-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Onboarding — accessible when wallet connected but not yet onboarded.
          ProtectedRoute allows wallet-connected-not-onboarded users through to
          /onboarding (it only redirects away from OTHER protected pages). */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* App (auth required) */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/orders" element={<PurchaseOrders />} />
          <Route path="/app/orders/new" element={<CreatePO />} />
          <Route path="/app/orders/supplier" element={<SupplierOrders />} />
          <Route path="/app/orders/:id" element={<OrderDetail />} />
          <Route path="/app/deals" element={<MyDeals />} />
          <Route path="/app/deals/new" element={<CreateDeal />} />
          <Route path="/app/deals/discover" element={<Discover />} />
          <Route path="/app/deals/discover/:dealId" element={<Contribute />} />
          <Route path="/app/deals/admin" element={<AdminDeals />} />
          <Route path="/app/deals/admin/:dealId" element={<AdminDealDetail />} />
          <Route path="/app/deals/:dealId" element={<DealDetail />} />
          <Route path="/app/portfolio" element={<Portfolio />} />
          <Route path="/app/claims" element={<Claims />} />
          <Route path="/app/payouts" element={<Payouts />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {

  return (
    
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <ScrollToTop />
        <WalletProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </WalletProvider>
      </Router>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App