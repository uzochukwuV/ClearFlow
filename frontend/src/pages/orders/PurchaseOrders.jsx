import { db } from "@/api/db";
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, EmptyState, PageHeader, money } from '@/components/cf';
import { FileSignature, Plus } from 'lucide-react';

export default function PurchaseOrders() {
  const { address } = useWallet();
  const [pos, setPos] = useState(null);

  useEffect(() => {
    db.entities.PurchaseOrder.filter({ buyerAddress: address }, '-created_date', 100).then(setPos).catch(() => setPos([]));
  }, [address]);

  if (!pos) return <div className="py-20 text-center text-slate">Loading…</div>;

  return (
    <div>
      <PageHeader
        eyebrow="Buyer"
        title="Purchase Orders"
        desc="All POs you've created."
        action={<Link to="/app/orders/new"><Button><Plus className="mr-1 h-4 w-4" /> New PO</Button></Link>}
      />
      {pos.length === 0 ? (
        <EmptyState icon={FileSignature} title="No purchase orders" desc="Create your first purchase order to start a deal." action={<Link to="/app/orders/new"><Button size="sm">Create PO</Button></Link>} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {pos.map((p) => (
                <Link key={p.id} to={`/app/orders/${p.id}`} className="flex flex-col gap-2 p-4 transition-colors hover:bg-secondary sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-medium">{p.poReference}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="truncate text-sm text-slate">{p.description}</div>
                    <div className="mt-1 text-xs text-slate">Supplier: {p.supplierAddress?.slice(0, 10)}… · Qty {p.quantity}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold">{money(p.amount)}</span>
                    {p.status === 'SIGNED' && <Link to={`/app/deals/new?poId=${p.id}`}><Button size="sm" variant="outline">Create Deal</Button></Link>}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}