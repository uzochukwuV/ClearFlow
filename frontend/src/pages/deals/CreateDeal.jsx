import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader, money } from '@/components/cf';
import { logActivity } from '@/lib/activity';
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';

const COUNTRIES = ['US', 'CN', 'SG', 'GB', 'DE', 'NG', 'AE', 'JP'];

export default function CreateDeal() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const poId = params.get('poId');
  const { address, sign } = useWallet();
  const { toast } = useToast();
  const [po, setPo] = useState(null);
  const [form, setForm] = useState({ targetAmount: '', yield: '8.5', fundingDeadline: '', deliveryDeadline: '', countries: ['US', 'CN', 'SG'] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!poId) return;
    db.entities.PurchaseOrder.get(poId).then((p) => {
      setPo(p);
      setForm((f) => ({ ...f, targetAmount: String(p.amount) }));
    }).catch(() => setPo(null));
  }, [poId]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleCountry = (c) => setForm({ ...form, countries: form.countries.includes(c) ? form.countries.filter((x) => x !== c) : [...form.countries, c] });

  const handleSubmit = async () => {
    if (!po) return;
    if (Number(form.targetAmount) > po.amount) {
      toast({ title: 'Target cannot exceed PO amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const signature = await sign();
      const symbol = 'POF-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const wallet = '0x' + Math.random().toString(16).slice(2, 42).padEnd(40, '0');
      const created = await db.entities.Deal.create({
        poId: po.id,
        poReference: po.poReference,
        buyerAddress: address,
        buyerName: po.buyerName,
        targetAmount: Number(form.targetAmount),
        minimumAmount: Math.round(Number(form.targetAmount) * 0.8),
        yield: Number(form.yield),
        fundingDeadline: form.fundingDeadline ? new Date(form.fundingDeadline).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
        deliveryDeadline: form.deliveryDeadline ? new Date(form.deliveryDeadline).toISOString() : new Date(Date.now() + 90 * 86400000).toISOString(),
        eligibleCountries: form.countries,
        atokenSymbol: symbol,
        status: 'OPEN',
        runningTotal: 0,
        investorCount: 0,
        dealWalletAddress: wallet,
        supplierAddress: po.supplierAddress,
        supplierName: po.supplierName,
      });
      await db.entities.PurchaseOrder.update(po.id, { status: 'DEAL_CREATED' });
      await logActivity({ entityType: 'DEAL', entityId: created.id, action: 'DEAL_LAUNCHED', label: `Buyer launched funding deal ${symbol} at ${Number(form.yield)}% APR`, actorAddress: address, actorRole: 'BUYER', status: 'OPEN', meta: { target: Number(form.targetAmount), yield: Number(form.yield) } });
      await logActivity({ entityType: 'PURCHASE_ORDER', entityId: po.id, action: 'DEAL_LAUNCHED', label: `Funding deal ${symbol} launched from this PO`, actorAddress: address, actorRole: 'BUYER', status: 'DEAL_CREATED' });
      toast({ title: 'Deal launched', description: `${symbol} is now open for funding.` });
      navigate('/app/deals');
    } catch (e) {
      toast({ title: 'Could not create deal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!po) return <div className="py-20 text-center text-slate">Loading purchase order…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <PageHeader eyebrow="New deal" title="Create Funding Deal" desc={`From ${po.poReference} · ${money(po.amount)}`} />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <Label>Target Amount (USD) *</Label>
            <Input type="number" value={form.targetAmount} onChange={set('targetAmount')} />
            <p className="text-xs text-slate">Must be ≤ PO amount ({money(po.amount)}).</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Yield (%) *</Label>
              <Input type="number" step="0.1" value={form.yield} onChange={set('yield')} />
            </div>
            <div className="space-y-2">
              <Label>Funding Deadline</Label>
              <Input type="date" value={form.fundingDeadline} onChange={set('fundingDeadline')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Delivery Deadline</Label>
            <Input type="date" value={form.deliveryDeadline} onChange={set('deliveryDeadline')} />
          </div>
          <div className="space-y-2">
            <Label>Eligible Investor Countries</Label>
            <div className="flex flex-wrap gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCountry(c)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${form.countries.includes(c) ? 'border-foreground bg-foreground text-card' : 'border-border bg-card text-slate hover:text-foreground'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border bg-secondary p-3 text-sm">
            <div className="flex items-center gap-2 text-slate"><ShieldCheck className="h-4 w-4" /> You'll sign EIP-712 and an A-Token will be auto-generated.</div>
          </div>
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Launching…</> : 'Sign & Launch Deal'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}