import { db } from "@/api/db";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/cf';
import { logActivity } from '@/lib/activity';
import { Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function CreatePO() {
  const navigate = useNavigate();
  const { address, sign, shortAddr } = useWallet();
  const { toast } = useToast();
  const [form, setForm] = useState({ supplierAddress: '', amount: '', quantity: '', description: '', deliveryDate: '' });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async () => {
    if (!form.supplierAddress || !form.amount || !form.description) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const signature = await sign();
      const ref = 'PO-' + Date.now().toString().slice(-8);
      const created = await db.entities.PurchaseOrder.create({
        poReference: ref,
        buyerAddress: address,
        buyerName: 'You',
        supplierAddress: form.supplierAddress,
        supplierName: 'Supplier',
        amount: Number(form.amount),
        currency: 'USD',
        quantity: Number(form.quantity) || 0,
        description: form.description,
        deliveryDate: form.deliveryDate,
        status: 'PENDING_SUPPLIER_SIGNATURE',
        buyerSignature: signature,
      });
      await logActivity({ entityType: 'PURCHASE_ORDER', entityId: created.id, action: 'PO_CREATED', label: `Buyer created ${ref} for ${Number(form.amount)} USD`, actorAddress: address, actorRole: 'BUYER', status: 'PENDING_SUPPLIER_SIGNATURE', meta: { amount: Number(form.amount) } });
      toast({ title: 'Purchase order created', description: `${ref} — awaiting supplier signature.` });
      navigate('/app/orders');
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
          <div className="rounded-md border border-border bg-secondary p-3 text-sm">
            <div className="flex items-center gap-2 text-slate"><ShieldCheck className="h-4 w-4" /> You'll sign an EIP-712 message as <span className="font-mono">{shortAddr(address)}</span></div>
          </div>
          <Button className="w-full" size="lg" onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing & submitting…</> : 'Sign & Create PO'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}