import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { useSupplierPOs, useSignPurchaseOrder } from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, EmptyState, PageHeader, money } from '@/components/cf';
import { useToast } from '@/components/ui/use-toast';
import { FileSignature, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function SupplierOrders() {
  const { address, sign, signPurchaseOrder, shortAddr } = useWallet();
  const { toast } = useToast();
  const { data, isLoading } = useSupplierPOs(address);
  const signPO = useSignPurchaseOrder();
  const [signing, setSigning] = useState(null);
  const pos = data?.data?.items || [];

  const handleSign = async (po) => {
    setSigning(po.id);
    try {
      // Build canonical PO from the PO record (terms the buyer signed).
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
    } finally {
      setSigning(null);
    }
  };

  if (isLoading) return <div className="py-20 text-center text-slate"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader eyebrow="Supplier" title="Purchase Orders to Sign" desc="Review and sign purchase orders sent to your wallet." />
      {pos.length === 0 ? (
        <EmptyState icon={FileSignature} title="No purchase orders" desc="POs addressed to your wallet will appear here." />
      ) : (
        <div className="space-y-4">
          {pos.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/app/orders/${p.id}`} className="font-heading font-medium hover:underline">{p.poReference}</Link>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-1 text-sm text-slate">{p.poReference}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><div className="text-xs text-slate">Amount</div><div className="font-medium">{money(p.amount)}</div></div>
                      <div><div className="text-xs text-slate">Quantity</div><div className="font-medium">{p.quantity}</div></div>
                      <div><div className="text-xs text-slate">Delivery</div><div className="font-medium">{p.deliveryDate ? new Date(p.deliveryDate).toLocaleDateString() : '—'}</div></div>
                      <div><div className="text-xs text-slate">Buyer</div><div className="font-mono text-xs">{shortAddr(p.buyerAddress)}</div></div>
                    </div>
                    {p.buyerSignature && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-steel"><CheckCircle2 className="h-3.5 w-3.5" /> Buyer signed</div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {p.status === 'PENDING_SUPPLIER_SIGNATURE' ? (
                      <Button onClick={() => handleSign(p)} disabled={signing === p.id}>
                        {signing === p.id ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Signing…</> : <><ShieldCheck className="mr-1 h-4 w-4" /> Sign PO</>}
                      </Button>
                    ) : (
                      <Link to={`/app/orders/${p.id}`}><Button variant="outline" size="sm">View details</Button></Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}