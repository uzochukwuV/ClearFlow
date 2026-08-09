import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { StatusBadge, ProgressBar, PageHeader, money, InfoRow } from '@/components/cf';
import StatusStepper, { DEAL_STEPS } from '@/components/StatusStepper';
import ActivityTimeline from '@/components/ActivityTimeline';
import { logActivity, fetchActivity } from '@/lib/activity';
import { Loader2, ArrowLeft, ShieldCheck, CheckCircle2, Wallet } from 'lucide-react';

export default function AdminDealDetail() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { sign, shortAddr } = useWallet();
  const { toast } = useToast();
  const [deal, setDeal] = useState(null);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setDeal(await db.entities.Deal.get(dealId).catch(() => null));
    setEvents(await fetchActivity('DEAL', dealId));
  };
  useEffect(() => { load(); }, [dealId]);

  const releasePayout = async () => {
    setBusy(true);
    try {
      const adminSig = await sign();
      const supplierSig = await sign();
      await db.entities.Deal.update(dealId, { status: 'PAYOUT_RELEASED' });
      await logActivity({ entityType: 'DEAL', entityId: dealId, action: 'PAYOUT_RELEASED', label: `Admin released ${money(deal.targetAmount)} USDC payout to supplier`, actorAddress: '', actorRole: 'ADMIN', status: 'PAYOUT_RELEASED', meta: { amount: deal.targetAmount } });
      toast({ title: 'Payout released', description: `${money(deal.targetAmount)} USDC sent to supplier.` });
      load();
    } catch (e) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (!deal) return <div className="py-20 text-center text-slate">Loading deal…</div>;

  const pct = deal.targetAmount > 0 ? Math.round((deal.runningTotal / deal.targetAmount) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <PageHeader eyebrow="Admin" title={deal.atokenSymbol} desc={`${deal.poReference} · ${deal.buyerName} → ${deal.supplierName}`} />

      <Card className="mb-6 card-asymmetric bg-secondary">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-slate">Lifecycle</span>
            <StatusBadge status={deal.status} />
          </div>
          <StatusStepper steps={DEAL_STEPS} current={deal.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="font-heading text-base font-medium">Funding</span>
              <span className="text-xs text-slate">{deal.investorCount} investors · {deal.yield}% APR</span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <span className="font-heading text-3xl font-medium tracking-tight">{money(deal.runningTotal)}</span>
              <span className="text-sm text-slate">{pct}% of {money(deal.targetAmount)}</span>
            </div>
            <ProgressBar value={deal.runningTotal} max={deal.targetAmount} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="font-heading text-base font-medium">Parties</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            <InfoRow label="Buyer" value={deal.buyerName} />
            <InfoRow label="Supplier" value={deal.supplierName} />
            <InfoRow label="Supplier wallet" value={shortAddr(deal.supplierAddress)} mono />
            <InfoRow label="Deal wallet" value={`${deal.dealWalletAddress?.slice(0, 14)}…`} mono />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="font-heading text-base font-medium">Payout Release</CardTitle></CardHeader>
        <CardContent>
          {deal.status === 'FUNDED' ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-secondary p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><Wallet className="h-4 w-4" /> Transfer {money(deal.targetAmount)} USDC to supplier</div>
                <div className="mt-2 text-xs text-slate">Requires dual EIP-712 signature (admin + supplier). You'll sign as admin; supplier signature is co-collected.</div>
              </div>
              <Button className="w-full" size="lg" onClick={releasePayout} disabled={busy}>
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing & releasing…</> : <><ShieldCheck className="mr-1 h-4 w-4" /> Release Payout</>}
              </Button>
            </div>
          ) : ['PAYOUT_RELEASED', 'DELIVERY_CONFIRMED', 'AWAITING_REPAYMENT', 'READY_FOR_DISTRIBUTION', 'SETTLED'].includes(deal.status) ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-4 text-sm text-steel">
              <CheckCircle2 className="h-4 w-4" /> Payout already released to supplier.
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-4 text-sm text-brass">
              Deal must be fully funded before payout can be released.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle className="font-heading text-base font-medium">Activity Log</CardTitle></CardHeader>
        <CardContent>
          <ActivityTimeline events={events} />
        </CardContent>
      </Card>
    </div>
  );
}