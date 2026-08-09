import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { StatusBadge, ProgressBar, PageHeader, money, money2, InfoRow } from '@/components/cf';
import StatusStepper, { DEAL_STEPS } from '@/components/StatusStepper';
import ActivityTimeline from '@/components/ActivityTimeline';
import { logActivity, fetchActivity } from '@/lib/activity';
import { Loader2, ArrowLeft, ShieldCheck, CheckCircle2, Truck, DollarSign, Coins } from 'lucide-react';

export default function DealDetail() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { address, sign, role: walletRole } = useWallet();
  const { toast } = useToast();
  const [deal, setDeal] = useState(null);
  const [contribs, setContribs] = useState([]);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    const d = await db.entities.Deal.get(dealId);
    setDeal(d);
    try {
      const cs = await db.entities.Contribution.filter({ dealId }, '-created_date', 100);
      setContribs(cs);
    } catch { setContribs([]); }
    setEvents(await fetchActivity('DEAL', dealId));
  };
  useEffect(() => { load(); }, [dealId]);

  const role = (walletRole || 'BUYER').toUpperCase();
  const isBuyer = role === 'BUYER' && deal?.buyerAddress === address;

  const confirmDelivery = async () => {
    setBusy('delivery');
    try {
      await sign();
      await db.entities.Deal.update(dealId, { status: 'DELIVERY_CONFIRMED' });
      await logActivity({ entityType: 'DEAL', entityId: dealId, action: 'DELIVERY_CONFIRMED', label: 'Buyer confirmed delivery of goods', actorAddress: address, actorRole: 'BUYER', status: 'DELIVERY_CONFIRMED' });
      await db.entities.Deal.update(dealId, { status: 'AWAITING_REPAYMENT' });
      toast({ title: 'Delivery confirmed', description: 'Awaiting your repayment.' });
      load();
    } catch (e) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const repay = async () => {
    setBusy('repay');
    try {
      await sign();
      const yieldAmt = (deal.targetAmount || 0) * (deal.yield || 0) / 100;
      await db.entities.Deal.update(dealId, { status: 'READY_FOR_DISTRIBUTION' });
      await logActivity({ entityType: 'DEAL', entityId: dealId, action: 'REPAYMENT_MADE', label: `Buyer repaid ${money2(deal.targetAmount + yieldAmt)} (principal + yield)`, actorAddress: address, actorRole: 'BUYER', status: 'READY_FOR_DISTRIBUTION', meta: { principal: deal.targetAmount, yield: yieldAmt } });
      toast({ title: 'Repayment complete', description: `Paid ${money2(deal.targetAmount + yieldAmt)}. Investors can now claim.` });
      load();
    } catch (e) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (!deal) return <div className="py-20 text-center text-slate">Loading deal…</div>;

  const pct = deal.targetAmount > 0 ? Math.round((deal.runningTotal / deal.targetAmount) * 100) : 0;
  const yieldAmt = (deal.targetAmount || 0) * (deal.yield || 0) / 100;
  const totalDue = (deal.targetAmount || 0) + yieldAmt;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <PageHeader eyebrow="Deal" title={deal.atokenSymbol} desc={`${deal.poReference} · ${deal.buyerName} → ${deal.supplierName}`} />

      {/* Status stepper */}
      <Card className="mb-6 card-asymmetric bg-secondary">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-slate">Lifecycle</span>
            <StatusBadge status={deal.status} />
          </div>
          <StatusStepper steps={DEAL_STEPS} current={deal.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <span className="font-heading text-base font-medium">Funding progress</span>
                <span className="text-xs text-slate">{deal.investorCount} investor{deal.investorCount === 1 ? '' : 's'} · {deal.yield}% APR</span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <span className="font-heading text-3xl font-medium tracking-tight">{money(deal.runningTotal)}</span>
                <span className="text-sm text-slate">{pct}% of {money(deal.targetAmount)}</span>
              </div>
              <ProgressBar value={deal.runningTotal} max={deal.targetAmount} className="mt-3" />
            </CardContent>
          </Card>

          {/* Buyer settlement actions */}
          {isBuyer && (
            <Card>
              <CardHeader><CardTitle className="font-heading text-base font-medium">Settlement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(deal.status === 'FUNDED' || deal.status === 'PAYOUT_RELEASED') && (
                  <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm text-steel"><Truck className="h-4 w-4" /> {deal.status === 'FUNDED' ? 'Payout released to supplier. Confirm when goods arrive.' : 'Awaiting your delivery confirmation.'}</div>
                    <Button size="sm" onClick={confirmDelivery} disabled={busy === 'delivery'} className="shrink-0">{busy === 'delivery' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Delivery'}</Button>
                  </div>
                )}
                {deal.status === 'AWAITING_REPAYMENT' && (
                  <div className="rounded-md border border-border bg-secondary p-4">
                    <div className="flex items-center gap-2 text-sm font-medium"><DollarSign className="h-4 w-4" /> Repayment due</div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-slate">Principal</span><span>{money2(deal.targetAmount)}</span></div>
                      <div className="flex justify-between"><span className="text-slate">Yield ({deal.yield}%)</span><span className="text-ember">{money2(yieldAmt)}</span></div>
                      <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total due</span><span>{money2(totalDue)}</span></div>
                    </div>
                    <Button className="mt-4 w-full" onClick={repay} disabled={busy === 'repay'}>
                      {busy === 'repay' ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Processing…</> : <><ShieldCheck className="mr-1 h-4 w-4" /> Make Repayment</>}
                    </Button>
                  </div>
                )}
                {deal.status === 'READY_FOR_DISTRIBUTION' && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-4 text-sm text-steel">
                    <CheckCircle2 className="h-4 w-4" /> Repayment complete — investors can now claim their returns.
                  </div>
                )}
                {deal.status === 'SETTLED' && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-4 text-sm text-slate">
                    <CheckCircle2 className="h-4 w-4" /> This deal is fully settled.
                  </div>
                )}
                {deal.status === 'OPEN' && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-4 text-sm text-slate">
                    <Coins className="h-4 w-4" /> Deal is still raising funds.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Contributions */}
          <Card>
            <CardHeader><CardTitle className="font-heading text-base font-medium">Contributions</CardTitle></CardHeader>
            <CardContent>
              {contribs.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate">No contributions yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {contribs.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-mono text-sm">{c.investorAddress?.slice(0, 10)}…</div>
                        <div className="text-xs text-slate">{c.paymentMethod} · {c.status}</div>
                      </div>
                      <span className="font-medium">{money(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity log */}
          <Card>
            <CardHeader><CardTitle className="font-heading text-base font-medium">Activity Log</CardTitle></CardHeader>
            <CardContent>
              <ActivityTimeline events={events} />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="font-heading text-base font-medium">Deal terms</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border">
              <InfoRow label="Target" value={money(deal.targetAmount)} />
              <InfoRow label="Minimum" value={money(deal.minimumAmount)} />
              <InfoRow label="Yield" value={`${deal.yield}% APR`} />
              <InfoRow label="Funding deadline" value={deal.fundingDeadline ? new Date(deal.fundingDeadline).toLocaleDateString() : '—'} />
              <InfoRow label="Delivery deadline" value={deal.deliveryDeadline ? new Date(deal.deliveryDeadline).toLocaleDateString() : '—'} />
              <InfoRow label="Deal wallet" value={`${deal.dealWalletAddress?.slice(0, 10)}…`} mono />
              <InfoRow label="Countries" value={(deal.eligibleCountries || []).join(', ')} />
            </CardContent>
          </Card>

          {role === 'INVESTOR' && deal.status === 'OPEN' && (
            <Link to={`/app/deals/discover/${deal.id}`}><Button className="w-full">Contribute to this deal</Button></Link>
          )}
          {role === 'INVESTOR' && deal.status === 'READY_FOR_DISTRIBUTION' && (
            <Link to="/app/claims"><Button className="w-full">Go to claims</Button></Link>
          )}
          {role === 'ADMIN' && deal.status === 'FUNDED' && (
            <Link to={`/app/deals/admin/${deal.id}`}><Button className="w-full">Release payout</Button></Link>
          )}
        </div>
      </div>
    </div>
  );
}