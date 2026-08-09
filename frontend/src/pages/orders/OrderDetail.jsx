import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { usePurchaseOrder, useSignPurchaseOrder } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { StatusBadge, PageHeader, money, InfoRow } from '@/components/cf';
import StatusStepper, { PO_STEPS } from '@/components/StatusStepper';
import { Loader2, ArrowLeft, ShieldCheck, CheckCircle2, Coins } from 'lucide-react';

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address, sign, signPurchaseOrder, shortAddr, role: walletRole } = useWallet();
  const { toast } = useToast();
  const { data: resp, isLoading } = usePurchaseOrder(id);
  const signPO = useSignPurchaseOrder();
  const [busy, setBusy] = useState(false);

  const po = resp?.data;

  const role = (walletRole || 'BUYER').toUpperCase();
  const isSupplier = role === 'SUPPLIER' && po?.supplierAddress === address;
  const isBuyer = role === 'BUYER' && po?.buyerAddress === address;

  const handleSign = async () => {
    if (!po) return;
    setBusy(true);
    try {
      const canonicalPO = {
        poReference: po.poReference,
        buyerAddress: po.buyerAddress,
        supplierAddress: po.supplierAddress,
        amount: String(po.amount),
        currency: po.currency || 'USD',
        quantity: po.quantity,
        deliveryDate: po.deliveryDate ? new Date(po.deliveryDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        poHash: po.poHash,
      };
      await signPO.mutateAsync({
        poId: po.id,
        po: canonicalPO,
        authSigner: sign,
        eip712Signer: signPurchaseOrder,
      });
      toast({ title: 'PO signed', description: `${po.poReference} is now fully signed.` });
    } catch (e) {
      toast({ title: 'Signing failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (isLoading || !po) return <div className="py-20 text-center text-slate"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <PageHeader eyebrow="Purchase Order" title={po.poReference} desc={po.poReference} />

      <Card className="mb-6 card-asymmetric bg-secondary">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-widest text-slate">Lifecycle</span>
            <StatusBadge status={po.status} />
          </div>
          <StatusStepper steps={PO_STEPS} current={po.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="font-heading text-base font-medium">Order details</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border">
              <InfoRow label="Amount" value={money(po.amount)} />
              <InfoRow label="Currency" value={po.currency || 'USD'} />
              <InfoRow label="Quantity" value={po.quantity || '—'} />
              <InfoRow label="Delivery date" value={po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : '—'} />
              <InfoRow label="Buyer" value={shortAddr(po.buyerAddress)} mono />
              <InfoRow label="Supplier" value={shortAddr(po.supplierAddress)} mono />
              {po.poHash && <InfoRow label="PO Hash" value={`${po.poHash.slice(0, 10)}…`} mono />}
            </CardContent>
          </Card>

          {/* Signatures */}
          <Card>
            <CardHeader><CardTitle className="font-heading text-base font-medium">Signatures</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary p-3 text-sm">
                <span className="text-slate">Buyer (EIP-712)</span>
                {po.buyerSignature ? (
                  <span className="flex items-center gap-1.5 text-foreground"><CheckCircle2 className="h-4 w-4" /> Signed</span>
                ) : <span className="text-slate">Pending</span>}
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary p-3 text-sm">
                <span className="text-slate">Supplier (EIP-712)</span>
                {po.supplierSignature ? (
                  <span className="flex items-center gap-1.5 text-foreground"><CheckCircle2 className="h-4 w-4" /> Signed</span>
                ) : <span className="text-slate">Pending</span>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="font-heading text-base font-medium">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isSupplier && po.status === 'PENDING_SUPPLIER_SIGNATURE' && (
                <Button className="w-full" onClick={handleSign} disabled={busy}>
                  {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Signing…</> : <><ShieldCheck className="mr-1 h-4 w-4" /> Sign PO</>}
                </Button>
              )}
              {isBuyer && po.status === 'SIGNED' && (
                <Link to={`/app/deals/new?poId=${po.id}`}><Button className="w-full"><Coins className="mr-1 h-4 w-4" /> Create Funding Deal</Button></Link>
              )}
              {po.status === 'DEAL_CREATED' && (
                <div className="rounded-md border border-border bg-secondary p-3 text-sm text-steel">
                  A funding deal has been launched from this PO.
                </div>
              )}
              {po.status === 'FULFILLED' && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-slate">
                  <CheckCircle2 className="h-4 w-4" /> This order has been fulfilled.
                </div>
              )}
              {po.status === 'PENDING_SUPPLIER_SIGNATURE' && !isSupplier && (
                <div className="rounded-md border border-border bg-secondary p-3 text-sm text-slate">
                  Awaiting supplier signature.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}