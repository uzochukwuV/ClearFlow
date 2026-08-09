import React from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import {
  useBuyerPOs, useSupplierPOs, useBuyerDeals, useSupplierDeals, useOpenDeals,
} from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, StatusBadge, ProgressBar, EmptyState, PageHeader, money } from '@/components/cf';
import { FileSignature, Coins, Wallet, TrendingUp, Plus, ArrowRight, Clock, LineChart, AlertCircle, Layers, Send, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { address, role: walletRole } = useWallet();
  const role = (walletRole || 'BUYER').toUpperCase();

  const buyerPOsQ = useBuyerPOs(address, { enabled: role === 'BUYER' || role === 'SUPPLIER' });
  const supplierPOsQ = useSupplierPOs(address, { enabled: role === 'BUYER' || role === 'SUPPLIER' });
  const buyerDealsQ = useBuyerDeals(address, { enabled: role === 'BUYER' });
  const supplierDealsQ = useSupplierDeals(address, { enabled: role === 'SUPPLIER' });
  const openDealsQ = useOpenDeals({ enabled: role === 'INVESTOR' || role === 'ADMIN' });

  const loading = role === 'INVESTOR' ? openDealsQ.isLoading : (buyerPOsQ.isLoading || supplierPOsQ.isLoading);
  if (loading) return <div className="py-20 text-center text-slate"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  const pos = (role === 'BUYER' ? buyerPOsQ.data?.data?.items : supplierPOsQ.data?.data?.items) || [];
  const buyerDeals = buyerDealsQ.data?.data?.deals || [];
  const supplierDeals = supplierDealsQ.data?.data?.deals || [];
  const openDeals = openDealsQ.data?.data?.deals || [];

  return (
    <div>
      <PageHeader
        eyebrow={`${role.toLowerCase()} view`}
        title="Dashboard"
        desc="One workspace for every party in the trade. Switch roles from the top bar to act as buyer, supplier, investor, or admin."
        action={role === 'BUYER' ? (
          <Link to="/app/orders/new"><Button><Plus className="mr-1 h-4 w-4" /> New Purchase Order</Button></Link>
        ) : role === 'INVESTOR' ? (
          <Link to="/app/deals/discover"><Button>Discover deals <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
        ) : role === 'ADMIN' ? (
          <Link to="/app/deals/admin"><Button variant="outline">View all deals</Button></Link>
        ) : (
          <Link to="/app/orders/supplier"><Button variant="outline">POs to sign <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
        )}
      />

      {role === 'BUYER' && <BuyerView pos={pos} deals={buyerDeals} />}
      {role === 'SUPPLIER' && <SupplierView pos={pos} deals={supplierDeals} />}
      {role === 'INVESTOR' && <InvestorView deals={openDeals} />}
      {role === 'ADMIN' && <AdminView deals={openDeals} />}
    </div>
  );
}

function BuyerView({ pos, deals }) {
  const totalPoValue = pos.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const activeDeals = deals.filter((d) => d.status === 'OPEN' || d.status === 'FUNDED').length;
  const funded = deals.reduce((s, d) => s + (d.fundedAmount || 0), 0);
  const pendingSig = pos.filter((p) => p.status === 'PENDING_SUPPLIER_SIGNATURE').length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Purchase Orders" value={pos.length} sub={`${pendingSig} awaiting signature`} icon={FileSignature} />
        <StatCard label="Total PO Value" value={money(totalPoValue)} icon={Wallet} />
        <StatCard label="Active Deals" value={activeDeals} sub={`${deals.length} total`} icon={Coins} />
        <StatCard label="Funds Raised" value={money(funded)} icon={TrendingUp} accent="text-ember" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-base font-medium">Recent Purchase Orders</CardTitle>
            <Link to="/app/orders" className="text-sm font-medium text-foreground ember-underline">View all</Link>
          </CardHeader>
          <CardContent>
            {pos.length === 0 ? (
              <EmptyState icon={FileSignature} title="No purchase orders yet" desc="Create your first PO to get funding started." action={<Link to="/app/orders/new"><Button size="sm"><Plus className="mr-1 h-4 w-4" /> Create PO</Button></Link>} />
            ) : (
              <div className="space-y-2">
                {pos.slice(0, 5).map((p) => (
                  <Link key={p.id} to={`/app/orders/${p.id}`} className="flex items-center justify-between rounded-md border border-border bg-card p-3 transition-colors hover:bg-secondary">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.poReference || 'PO'}</div>
                      <div className="truncate text-sm text-slate">Qty {p.quantity} · {p.currency || 'USD'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{money(p.amount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-base font-medium">Active Deals</CardTitle>
            <Link to="/app/deals" className="text-sm font-medium text-foreground ember-underline">View all</Link>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <EmptyState icon={Coins} title="No deals yet" desc="Create a deal from a signed PO to raise funding." />
            ) : (
              <div className="space-y-4">
                {deals.slice(0, 4).map((d) => (
                  <Link key={d.dealId} to={`/app/deals/${d.dealId}`} className="block rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{d.atokenSymbol}</div>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate">
                      <span>{money(d.fundedAmount)} / {money(d.targetAmount)}</span>
                      <span>{d.yieldPercent}% yield</span>
                    </div>
                    <ProgressBar value={d.fundedAmount} max={d.targetAmount} className="mt-2" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SupplierView({ pos, deals }) {
  const pending = pos.filter((p) => p.status === 'PENDING_SUPPLIER_SIGNATURE');
  const signed = pos.filter((p) => p.status === 'SIGNED' || p.status === 'DEAL_CREATED');
  const paidOut = deals.filter((d) => ['PAYOUT_RELEASED', 'DELIVERY_CONFIRMED', 'AWAITING_REPAYMENT', 'SETTLED'].includes(d.status));
  const payoutValue = paidOut.reduce((s, d) => s + (d.targetAmount || 0), 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting Signature" value={pending.length} icon={Clock} accent="text-brass" />
        <StatCard label="Signed POs" value={signed.length} icon={FileSignature} />
        <StatCard label="Payouts Released" value={paidOut.length} icon={Coins} />
        <StatCard label="Total Received" value={money(payoutValue)} icon={Wallet} accent="text-ember" />
      </div>
      <Card className="mt-8">
        <CardHeader><CardTitle className="font-heading text-base font-medium">Purchase Orders Awaiting Your Signature</CardTitle></CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState icon={FileSignature} title="Nothing to sign" desc="Purchase orders awaiting your signature will appear here." action={<Link to="/app/orders/supplier"><Button size="sm" variant="outline">View all POs</Button></Link>} />
          ) : (
            <div className="space-y-2">
              {pending.map((p) => (
                <Link key={p.id} to={`/app/orders/${p.id}`} className="flex flex-col gap-2 rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{p.poReference}</div>
                    <div className="text-sm text-slate">{money(p.amount)} · Qty {p.quantity}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function InvestorView({ deals }) {
  const openDeals = deals.filter((d) => d.status === 'OPEN');
  const totalCapacity = openDeals.reduce((s, d) => s + (d.remainingCapacity || 0), 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Deals" value={openDeals.length} icon={Coins} />
        <StatCard label="Available Capacity" value={money(totalCapacity)} icon={Wallet} accent="text-ember" />
        <StatCard label="Avg Yield" value={`${openDeals.length ? (openDeals.reduce((s, d) => s + (d.yield || 0), 0) / openDeals.length).toFixed(1) : 0}%`} icon={TrendingUp} />
        <StatCard label="Browse" value="→" icon={LineChart} accent="text-brass" />
      </div>
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-heading text-base font-medium">Open Deals</CardTitle>
          <Link to="/app/deals/discover" className="text-sm font-medium text-foreground ember-underline">Discover all</Link>
        </CardHeader>
        <CardContent>
          {openDeals.length === 0 ? (
            <EmptyState icon={Coins} title="No open deals" desc="New funding deals will appear here as buyers launch them." action={<Link to="/app/deals/discover"><Button size="sm">Browse deals</Button></Link>} />
          ) : (
            <div className="space-y-2">
              {openDeals.slice(0, 5).map((d) => (
                <Link key={d.dealId} to={`/app/deals/discover/${d.dealId}`} className="flex items-center justify-between rounded-md border border-border bg-card p-3 transition-colors hover:bg-secondary">
                  <div>
                    <div className="font-medium">{d.atokenSymbol}</div>
                    <div className="text-sm text-slate">{d.poReference} · {d.yield}% APR</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{money(d.remainingCapacity)}</span>
                    <ArrowRight className="h-4 w-4 text-slate" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AdminView({ deals }) {
  const funded = deals.filter((d) => d.status === 'FUNDED');
  const open = deals.filter((d) => d.status === 'OPEN');
  const settled = deals.filter((d) => d.status === 'SETTLED');
  const totalValue = deals.reduce((s, d) => s + (d.targetAmount || 0), 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Deals" value={deals.length} icon={Layers} />
        <StatCard label="Open" value={open.length} icon={Coins} />
        <StatCard label="Funded — Payout Due" value={funded.length} icon={AlertCircle} accent="text-brass" />
        <StatCard label="Total Value" value={money(totalValue)} icon={TrendingUp} accent="text-ember" />
      </div>
      <Card className="mt-8">
        <CardHeader><CardTitle className="font-heading text-base font-medium">Deals Awaiting Payout Release</CardTitle></CardHeader>
        <CardContent>
          {funded.length === 0 ? (
            <EmptyState icon={Send} title="No payouts due" desc="Funded deals awaiting payout release will appear here." />
          ) : (
            <div className="space-y-3">
              {funded.map((d) => (
                <Link key={d.dealId} to={`/app/deals/admin/${d.dealId}`} className="block rounded-md border border-border bg-card p-4 transition-colors hover:bg-secondary">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{d.atokenSymbol}</div>
                      <div className="text-sm text-slate">{d.poReference}</div>
                    </div>
                    <Button size="sm">Release payout</Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-slate">
                    <span>{money(d.fundedAmount)} / {money(d.targetAmount)}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <ProgressBar value={d.fundedAmount} max={d.targetAmount} className="mt-2" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}