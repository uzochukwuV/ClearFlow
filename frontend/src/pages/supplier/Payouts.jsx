import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, EmptyState, PageHeader, money } from '@/components/cf';
import { Wallet } from 'lucide-react';

export default function Payouts() {
  const { address } = useWallet();
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    db.entities.Deal.filter({ supplierAddress: address }, '-created_date', 100).then(setDeals).catch(() => setDeals([]));
  }, [address]);

  if (!deals) return <div className="py-20 text-center text-slate">Loading…</div>;

  const paid = deals.filter((d) => ['PAYOUT_RELEASED', 'DELIVERY_CONFIRMED', 'AWAITING_REPAYMENT', 'READY_FOR_DISTRIBUTION', 'SETTLED'].includes(d.status));

  return (
    <div>
      <PageHeader eyebrow="Supplier" title="Payouts" desc="Funds released to you from funded deals." />
      {paid.length === 0 ? (
        <EmptyState icon={Wallet} title="No payouts yet" desc="Once a deal is funded and the admin releases payout, it will appear here." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {paid.map((d) => (
                <Link key={d.id} to={`/app/deals/${d.id}`} className="flex items-center justify-between p-4 transition-colors hover:bg-secondary">
                  <div>
                    <div className="font-heading font-medium">{d.atokenSymbol}</div>
                    <div className="text-sm text-slate">{d.poReference} · {d.buyerName}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{money(d.targetAmount)}</span>
                    <StatusBadge status={d.status} />
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