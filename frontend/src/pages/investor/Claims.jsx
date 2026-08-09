import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, EmptyState, PageHeader, money, money2 } from '@/components/cf';
import { useToast } from '@/components/ui/use-toast';
import { logActivity } from '@/lib/activity';
import { ShieldCheck, Loader2, Gift, CheckCircle2 } from 'lucide-react';

export default function Claims() {
  const { address, sign } = useWallet();
  const { toast } = useToast();
  const [contribs, setContribs] = useState(null);
  const [deals, setDeals] = useState({});
  const [claiming, setClaiming] = useState(null);

  const load = () => {
    db.entities.Contribution.filter({ investorAddress: address }, '-created_date', 200).then(async (cs) => {
      setContribs(cs);
      const dealIds = [...new Set(cs.map((c) => c.dealId))];
      const ds = await Promise.all(dealIds.map((id) => db.entities.Deal.get(id).catch(() => null)));
      const map = {};
      ds.filter(Boolean).forEach((d) => { map[d.id] = d; });
      setDeals(map);
    }).catch(() => setContribs([]));
  };
  useEffect(() => { load(); }, [address]);

  const handleClaim = async (c) => {
    const d = deals[c.dealId];
    if (!d) return;
    setClaiming(c.id);
    try {
      const signature = await sign();
      const yieldAmt = (c.amount || 0) * (d.yield || 0) / 100;
      const total = (c.amount || 0) + yieldAmt;
      const claimTx = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
      await db.entities.Contribution.update(c.id, { status: 'CLAIMED', claimAmount: total, claimTxHash: claimTx });
      await logActivity({ entityType: 'DEAL', entityId: c.dealId, action: 'CLAIM_MADE', label: `Investor claimed ${money2(total)} (principal + yield)`, actorAddress: address, actorRole: 'INVESTOR', status: d.status, meta: { total, claimTx } });
      await logActivity({ entityType: 'CONTRIBUTION', entityId: c.id, action: 'CLAIM_MADE', label: 'Claimed — A-Tokens burned', actorAddress: address, actorRole: 'INVESTOR', status: 'CLAIMED', meta: { total, claimTx } });
      toast({ title: 'Claim successful', description: `${money2(total)} USDC transferred to your wallet.` });
      load();
    } catch (e) {
      toast({ title: 'Claim failed', description: e.message, variant: 'destructive' });
    } finally {
      setClaiming(null);
    }
  };

  if (!contribs) return <div className="py-20 text-center text-slate">Loading claims…</div>;

  const claimable = contribs.filter((c) => {
    const d = deals[c.dealId];
    return d && d.status === 'READY_FOR_DISTRIBUTION' && c.status === 'CONFIRMED';
  });
  const history = contribs.filter((c) => c.status === 'CLAIMED');

  return (
    <div>
      <PageHeader eyebrow="Investor" title="Claims" desc="Claim your principal + yield once a deal is ready for distribution." />

      {claimable.length === 0 && history.length === 0 ? (
        <EmptyState icon={Gift} title="Nothing to claim yet" desc="When a buyer repays a deal you've funded, your claim will appear here." />
      ) : (
        <div className="space-y-8">
          {claimable.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-slate">Ready to claim</h2>
              <div className="space-y-4">
                {claimable.map((c) => {
                  const d = deals[c.dealId];
                  const yieldAmt = (c.amount || 0) * (d.yield || 0) / 100;
                  const total = (c.amount || 0) + yieldAmt;
                  return (
                    <Card key={c.id}>
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-heading font-semibold">{c.atokenSymbol}</span>
                              <StatusBadge status={d.status} />
                            </div>
                            <div className="mt-2 space-y-0.5 text-sm">
                              <div className="flex justify-between gap-8"><span className="text-slate">Your investment</span><span>{money(c.amount)}</span></div>
                              <div className="flex justify-between gap-8"><span className="text-slate">Your yield ({d.yield}%)</span><span className="text-ember">{money2(yieldAmt)}</span></div>
                              <div className="flex justify-between gap-8 border-t border-border pt-1 font-semibold"><span>Total to receive</span><span>{money2(total)}</span></div>
                            </div>
                          </div>
                          <Button onClick={() => handleClaim(c)} disabled={claiming === c.id} className="shrink-0">
                            {claiming === c.id ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Claiming…</> : <><ShieldCheck className="mr-1 h-4 w-4" /> Claim now</>}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-slate">Claim history</h2>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {history.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-steel" />
                          <span className="font-medium">{c.atokenSymbol}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate">{(c.tokenAmount || 0).toLocaleString()} tokens burned</span>
                          <span className="font-semibold text-ember">{money2(c.claimAmount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}