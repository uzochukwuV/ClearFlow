import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, EmptyState, PageHeader, money, money2 } from '@/components/cf';
import { Coins, ArrowRight } from 'lucide-react';

export default function Portfolio() {
  const { address } = useWallet();
  const [contribs, setContribs] = useState(null);
  const [deals, setDeals] = useState({});

  useEffect(() => {
    db.entities.Contribution.filter({ investorAddress: address }, '-created_date', 200).then(async (cs) => {
      setContribs(cs);
      const dealIds = [...new Set(cs.map((c) => c.dealId))];
      const ds = await Promise.all(dealIds.map((id) => db.entities.Deal.get(id).catch(() => null)));
      const map = {};
      ds.filter(Boolean).forEach((d) => { map[d.id] = d; });
      setDeals(map);
    }).catch(() => setContribs([]));
  }, [address]);

  if (!contribs) return <div className="py-20 text-center text-slate">Loading portfolio…</div>;

  const confirmed = contribs.filter((c) => c.status === 'CONFIRMED' || c.status === 'CLAIMED');
  const totalInvested = confirmed.reduce((s, c) => s + (c.amount || 0), 0);
  const totalYield = confirmed.reduce((s, c) => {
    const d = deals[c.dealId];
    return s + (d ? (c.amount || 0) * (d.yield || 0) / 100 : 0);
  }, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Investor"
        title="Portfolio"
        desc="Your holdings across all deals."
        action={<Link to="/app/deals/discover"><Button variant="outline">Discover deals <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wider text-slate">Total Invested</div><div className="mt-2 font-heading text-2xl font-medium">{money(totalInvested)}</div></Card>
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wider text-slate">Projected Yield</div><div className="mt-2 font-heading text-2xl font-medium text-ember">{money2(totalYield)}</div></Card>
        <Card className="p-5"><div className="text-xs font-medium uppercase tracking-wider text-slate">Active Holdings</div><div className="mt-2 font-heading text-2xl font-medium">{confirmed.length}</div></Card>
      </div>

      {confirmed.length === 0 ? (
        <EmptyState icon={Coins} title="No holdings" desc="Contribute to a deal to build your portfolio." action={<Link to="/app/deals/discover"><Button size="sm">Browse deals</Button></Link>} />
      ) : (
        <div className="space-y-4">
          {confirmed.map((c) => {
            const d = deals[c.dealId];
            const yieldAmt = d ? (c.amount || 0) * (d.yield || 0) / 100 : 0;
            const canClaim = d && d.status === 'READY_FOR_DISTRIBUTION' && c.status === 'CONFIRMED';
            return (
              <Card key={c.id}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-medium">{c.atokenSymbol || d?.atokenSymbol}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="mt-1 text-sm text-slate">{d?.buyerName} · {d?.yield || 0}% APR</div>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <span><span className="text-slate">Tokens: </span>{(c.tokenAmount || c.amount || 0).toLocaleString()}</span>
                      <span><span className="text-slate">Value: </span>{money(c.amount)}</span>
                      <span><span className="text-slate">Yield: </span>{money2(yieldAmt)}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {canClaim ? (
                      <Link to="/app/claims"><Button size="sm">Claim {money2(c.amount + yieldAmt)}</Button></Link>
                    ) : c.status === 'CLAIMED' ? (
                      <span className="text-sm text-slate">Claimed</span>
                    ) : (
                      <span className="text-sm text-slate">{d?.status === 'AWAITING_REPAYMENT' ? 'Awaiting repayment' : 'In progress'}</span>
                    )}
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