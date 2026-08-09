import React from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { useBuyerDeals } from '@/api/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, ProgressBar, EmptyState, PageHeader, money } from '@/components/cf';
import { Coins, Loader2 } from 'lucide-react';

export default function MyDeals() {
  const { address } = useWallet();
  const { data, isLoading } = useBuyerDeals(address);
  const deals = data?.data?.deals || [];

  if (isLoading) return <div className="py-20 text-center text-slate"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader eyebrow="Buyer" title="My Deals" desc="Funding deals you've launched." />
      {deals.length === 0 ? (
        <EmptyState icon={Coins} title="No deals yet" desc="Create a deal from a signed purchase order." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {deals.map((d) => (
            <Link key={d.dealId} to={`/app/deals/${d.dealId}`}>
              <Card className="transition-colors hover:bg-secondary">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="font-heading font-medium">{d.atokenSymbol}</div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="mt-1 text-sm text-slate">{d.poReference} · {d.yieldPercent}% APR</div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="font-medium">{money(d.fundedAmount)}</span>
                    <span className="text-slate">of {money(d.targetAmount)}</span>
                  </div>
                  <ProgressBar value={d.fundedAmount} max={d.targetAmount} className="mt-2" />
                  <div className="mt-2 text-xs text-slate">{d.fundedPercent}% funded</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}