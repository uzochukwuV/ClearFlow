import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { usePurchaseOrder, useCreateDeal } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader, money } from '@/components/cf';
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';

const COUNTRIES = ['US', 'CN', 'SG', 'GB', 'DE', 'NG', 'AE', 'JP'];

export default function CreateDeal() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const poId = params.get('poId');
  const { address, sign } = useWallet();
  const { toast } = useToast();
  const { data: poResp, isLoading: poLoading } = usePurchaseOrder(poId);
  const createDeal = useCreateDeal();
  const [form, setForm] = useState({ targetAmount: '', yieldPercent: '8.5', fundingDeadline: '', deliveryDeadline: '', countries: ['US', 'CN', 'SG'] });
  const [saving, setSaving] = useState(false);

  const po = poResp?.data;

  useEffect(() => {
    if (po) {
      setForm((f) => ({ ...f, targetAmount: String(po.amount) }));
    }
  }, [po]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleCountry = (c) => setForm({ ...form, countries: form.countries.includes(c) ? form.countries.filter((x) => x !== c) : [...form.countries, c] });

  const handleSubmit = async () => {
    if (!po) return;
    if (Number(form.targetAmount) > Number(po.amount)) {
      toast({ title: 'Target cannot exceed PO amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const dealPayload = {
        purchaseOrderId: po.id,
        targetAmount: String(form.targetAmount),
        yieldPercent: Number(form.yieldPercent),
        fundingDeadline: form.fundingDeadline
          ? new Date(form.fundingDeadline).toISOString()
          : new Date(Date.now() + 30 * 86400000).toISOString(),
        deliveryDeadline: form.deliveryDeadline
          ? new Date(form.deliveryDeadline).toISOString()
          : new Date(Date.now() + 90 * 86400000).toISOString(),
        eligibleCountries: form.countries,
      };
      const result = await createDeal.mutateAsync({ deal: dealPayload, signer: sign });
      const dealId = result?.dealId || result?.data?.dealId || result?.id;
      toast({ title: 'Deal launched', description: 'Funding deal is now open for contributions.' });
      navigate(dealId ? `/app/deals/${dealId}` : '/app/deals');
    } catch (e) {
      toast({ title: 'Could not create deal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (poLoading || !po) return <div className="py-20 text-center text-slate"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

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
              <Input type="number" step="0.1" value={form.yieldPercent} onChange={set('yieldPercent')} />
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
            <div className="flex items-center gap-2 text-slate"><ShieldCheck className="h-4 w-4" /> You'll sign with your wallet and an A-Token will be auto-generated.</div>
          </div>
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Launching…</> : 'Sign & Launch Deal'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}