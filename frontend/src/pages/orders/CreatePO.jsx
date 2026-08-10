import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { getAccounts } from '@/lib/signing';
import { useCreatePurchaseOrder } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/cf';
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function CreatePO() {
  const navigate = useNavigate();
  const { address, signPurchaseOrder, shortAddr } = useWallet();
  const createPO = useCreatePurchaseOrder();
  const { toast } = useToast();
  const [form, setForm] = useState({ supplierAddress: '', amount: '', quantity: '', description: '', deliveryDate: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async () => {
    if (!form.supplierAddress || !form.amount || !form.description) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.supplierAddress)) {
      toast({ title: 'Invalid supplier address', description: 'Must be a 0x-prefixed 40-char hex address.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const [freshBuyerAddress] = await getAccounts();
      const buyerAddress = freshBuyerAddress || address;
      if (!buyerAddress) {
        throw new Error('Wallet not connected.');
      }
      if (address && freshBuyerAddress && freshBuyerAddress.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Connected wallet changed. State wallet ${address} does not match active wallet ${freshBuyerAddress}. Please reconnect or switch accounts, then try again.`);
      }

      const poReference = 'PO-' + Date.now().toString().slice(-8);
      const canonicalPO = {
        poReference,
        buyerAddress,
        supplierAddress: form.supplierAddress,
        amount: String(form.amount),
        currency: 'USD',
        quantity: Number(form.quantity) || 1,
        deliveryDate: form.deliveryDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      };

      console.debug('[PO:CreatePO] submit wallet check', {
        walletStateAddress: address,
        freshBuyerAddress,
        buyerAddress,
        poReference,
      });

      const result = await createPO.mutateAsync({ po: canonicalPO, eip712Signer: signPurchaseOrder });
      toast({ title: 'Purchase order created', description: `${poReference} — awaiting supplier signature.` });
      navigate(`/app/orders/${result.poId}`);
    } catch (e) {
      toast({ title: 'Could not create PO', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <PageHeader eyebrow="New order" title="New Purchase Order" desc="Fill in the trade details. You'll sign with your wallet before submitting." />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <Label>Supplier Wallet Address *</Label>
            <Input value={form.supplierAddress} onChange={set('supplierAddress')} placeholder="0x…" className="font-mono" />
            <p className="text-xs text-slate">The supplier who will sign this PO.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount (USD) *</Label>
              <Input type="number" value={form.amount} onChange={set('amount')} placeholder="250000" />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity} onChange={set('quantity')} placeholder="10000" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea value={form.description} onChange={set('description')} placeholder="Electronic components, batch #4421…" />
          </div>
          <div className="space-y-2">
            <Label>Delivery Date</Label>
            <Input type="date" value={form.deliveryDate} onChange={set('deliveryDate')} />
          </div>
          <div className="rounded-md border border-border bg-secondary p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 text-slate"><ShieldCheck className="h-4 w-4" /> You'll sign an EIP-712 message as <span className="font-mono">{shortAddr(address)}</span></div>
            <div className="text-xs text-slate">Live wallet: <span className="font-mono">{address || 'not connected'}</span></div>
          </div>
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing & submitting…</> : 'Sign & Create PO'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}