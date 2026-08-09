import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, ProgressBar, EmptyState, PageHeader, money } from '@/components/cf';
import { Coins } from 'lucide-react';

export default function AdminDeals() {
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    db.entities.Deal.list('-created_date', 200).then(setDeals).catch(() => setDeals([]));
  }, []);

  if (!deals) return <div className="py-20 text-center text-slate">Loading…</div>;

  return (
    <div>
      <PageHeader eyebrow="Admin" title="All Deals" desc="Every deal on the platform." />
      {deals.length === 0 ? (
        <EmptyState icon={Coins} title="No deals" desc="Deals will appear here once buyers launch them." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {deals.map((d) => (
                <Link key={d.id} to={`/app/deals/admin/${d.id}`} className="flex flex-col gap-2 p-4 transition-colors hover:bg-secondary sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-medium">{d.atokenSymbol}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="truncate text-sm text-slate">{d.buyerName} → {d.supplierName} · {d.poReference}</div>
                    <div className="mt-2 max-w-xs"><ProgressBar value={d.runningTotal} max={d.targetAmount} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{money(d.runningTotal)} / {money(d.targetAmount)}</span>
                    {d.status === 'FUNDED' && <Button size="sm">Release payout</Button>}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}