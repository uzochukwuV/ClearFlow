import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { useOpenDeals } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProgressBar, EmptyState, PageHeader, money } from '@/components/cf';
import { LineChart, Search, TrendingUp, Loader2 } from 'lucide-react';

export default function Discover() {
  const { data, isLoading } = useOpenDeals();
  const [q, setQ] = useState('');
  const [minYield, setMinYield] = useState('');
  const deals = data?.data?.deals || [];

  if (isLoading) return <div className="py-20 text-center text-slate"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  const open = deals
    .filter((d) => !q || (d.atokenSymbol + d.buyerAddress + d.poReference).toLowerCase().includes(q.toLowerCase()))
    .filter((d) => !minYield || d.yield >= Number(minYield));

  return (
    <div>
      <PageHeader eyebrow="Investor" title="Discover Deals" desc="Browse open funding deals and earn yield." />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by symbol, buyer, or PO…" className="pl-9" />
        </div>
        <div className="sm:w-40">
          <Input type="number" step="0.1" value={minYield} onChange={(e) => setMinYield(e.target.value)} placeholder="Min yield %" />
        </div>
      </div>

      {open.length === 0 ? (
        <EmptyState icon={LineChart} title="No open deals" desc="New funding deals will appear here as buyers launch them." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {open.map((d) => {
            return (
              <Card key={d.dealId} className="flex flex-col transition-colors hover:bg-secondary">
                <CardContent className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-heading font-semibold">{d.atokenSymbol}</div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-ember"><TrendingUp className="h-3 w-3" /> {d.yield}% APR</span>
                  </div>
                  <div className="mt-1 text-sm text-slate">{d.buyerAddress ? `${d.buyerAddress.slice(0, 8)}…` : '—'} · {d.poReference}</div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{money(d.fundedAmount)}</span>
                      <span className="text-slate">{d.fundedPercent}% of {money(d.targetAmount)}</span>
                    </div>
                    <ProgressBar value={d.fundedAmount} max={d.targetAmount} className="mt-2" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(d.eligibleCountries || []).slice(0, 5).map((c) => (
                      <span key={c} className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-slate">{c}</span>
                    ))}
                  </div>
                  <div className="mt-auto pt-4">
                    <Link to={`/app/deals/discover/${d.dealId}`}><Button className="w-full" size="sm">View & Contribute</Button></Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}