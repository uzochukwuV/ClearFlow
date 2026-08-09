import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, ProgressBar, EmptyState, PageHeader, money } from '@/components/cf';
import { Coins } from 'lucide-react';

export default function MyDeals() {
  const { address } = useWallet();
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    db.entities.Deal.filter({ buyerAddress: address }, '-created_date', 100).then(setDeals).catch(() => setDeals([]));
  }, [address]);

  if (!deals) return <div className="py-20 text-center text-slate">Loading…</div>;

  return (
    <div>
      <PageHeader eyebrow="Buyer" title="My Deals" desc="Funding deals you've launched." />
      {deals.length === 0 ? (
        <EmptyState icon={Coins} title="No deals yet" desc="Create a deal from a signed purchase order." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {deals.map((d) => (
            <Link key={d.id} to={`/app/deals/${d.id}`}>
              <Card className="transition-colors hover:bg-secondary">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-heading font-medium">{d.atokenSymbol}</div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="mt-1 text-sm text-slate">{d.poReference} · {d.yield}% APR</div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="font-medium">{money(d.runningTotal)}</span>
                    <span className="text-slate">of {money(d.targetAmount)}</span>
                  </div>
                  <ProgressBar value={d.runningTotal} max={d.targetAmount} className="mt-2" />
                  <div className="mt-2 text-xs text-slate">{d.investorCount} investor{d.investorCount === 1 ? '' : 's'}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}