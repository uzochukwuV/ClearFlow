import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Layers, LayoutDashboard, FileSignature, Coins, Wallet, ShieldCheck, LineChart, LogOut, Menu, X, ArrowLeft } from 'lucide-react';

const ROLES = [
  { key: 'BUYER', label: 'Buyer', icon: FileSignature },
  { key: 'SUPPLIER', label: 'Supplier', icon: Wallet },
  { key: 'INVESTOR', label: 'Investor', icon: LineChart },
  { key: 'ADMIN', label: 'Admin', icon: ShieldCheck },
];

const ROLE_NAV = {
  BUYER: [
    { label: 'Dashboard', to: '/app', icon: LayoutDashboard },
    { label: 'Purchase Orders', to: '/app/orders', icon: FileSignature },
    { label: 'My Deals', to: '/app/deals', icon: Coins },
  ],
  SUPPLIER: [
    { label: 'Dashboard', to: '/app', icon: LayoutDashboard },
    { label: 'POs to Sign', to: '/app/orders/supplier', icon: FileSignature },
    { label: 'Payouts', to: '/app/payouts', icon: Wallet },
  ],
  INVESTOR: [
    { label: 'Dashboard', to: '/app', icon: LayoutDashboard },
    { label: 'Discover Deals', to: '/app/deals/discover', icon: LineChart },
    { label: 'Portfolio', to: '/app/portfolio', icon: Coins },
    { label: 'Claims', to: '/app/claims', icon: ShieldCheck },
  ],
  ADMIN: [
    { label: 'Dashboard', to: '/app', icon: LayoutDashboard },
    { label: 'All Deals', to: '/app/deals/admin', icon: Coins },
  ],
};

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { address, shortAddr, role: walletRole, setRole, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  const role = (walletRole || 'BUYER').toUpperCase();
  const nav = ROLE_NAV[role] || ROLE_NAV.BUYER;

  const switchRole = (r) => {
    setRole(r);
    setOpen(false);
    navigate('/app');
  };

  const handleDisconnect = () => {
    disconnect();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-card">
              <Layers className="h-4 w-4" />
            </div>
            <span className="font-heading text-base font-semibold tracking-tight">ClearFlow</span>
          </Link>
          <button className="md:hidden" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        <div className="px-3 py-4">
          <div className="mb-4 rounded-lg border border-border bg-secondary p-3">
            <div className="text-[10px] font-medium uppercase tracking-widest text-slate">Active role</div>
            <div className="mt-0.5 font-heading text-sm font-medium capitalize">{role.toLowerCase()}</div>
            <div className="mt-2 truncate font-mono text-xs text-slate" title={address}>{address ? shortAddr(address) : 'no wallet'}</div>
          </div>

          <nav className="space-y-1">
            {nav.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                    active ? 'bg-foreground text-card' : 'text-steel hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 space-y-1 border-t border-border pt-4">
            <Link to="/" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-steel hover:bg-secondary hover:text-foreground">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Back to site
            </Link>
            <button onClick={handleDisconnect} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-steel hover:bg-secondary hover:text-foreground">
              <LogOut className="h-4 w-4" strokeWidth={1.5} /> Disconnect
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-xl md:px-8">
          <button className="md:hidden" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <div className="hidden text-sm text-slate md:block">
            {address ? `Connected: ${shortAddr(address)}` : 'Welcome to ClearFlow.'}
          </div>
          {/* Role switcher — act as any type at any time */}
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-full border border-border bg-secondary p-1 sm:flex">
              {ROLES.map((r) => {
                const active = r.key === role;
                return (
                  <button
                    key={r.key}
                    onClick={() => switchRole(r.key)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active ? 'bg-foreground text-card' : 'text-steel hover:text-foreground'
                    }`}
                  >
                    <r.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span className="hidden lg:inline">{r.label}</span>
                  </button>
                );
              })}
            </div>
            {address && (
              <span className="hidden rounded-full border border-border bg-card px-3 py-1.5 font-mono text-xs text-steel sm:block">
                {shortAddr(address)}
              </span>
            )}
          </div>
        </header>
        <main className="px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto max-w-[1200px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}