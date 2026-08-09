import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

/* ---------- Money helpers ---------- */
export function money(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
}
export function money2(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

/* ---------- Status styling (monochrome + ember punctuation) ---------- */
const STATUS_STYLES = {
  PENDING_SUPPLIER_SIGNATURE: 'text-brass',
  SIGNED: 'text-foreground',
  DEAL_CREATED: 'text-foreground',
  FULFILLED: 'text-steel',
  OPEN: 'text-brass',
  FUNDED: 'text-ember',
  PAYOUT_RELEASED: 'text-ember',
  DELIVERY_CONFIRMED: 'text-foreground',
  AWAITING_REPAYMENT: 'text-brass',
  READY_FOR_DISTRIBUTION: 'text-ember',
  SETTLED: 'text-steel',
  PENDING: 'text-brass',
  CONFIRMED: 'text-foreground',
  FAILED: 'text-destructive',
  REFUNDED: 'text-steel',
  CLAIMED: 'text-steel',
};

const STATUS_DOT = {
  PENDING_SUPPLIER_SIGNATURE: 'bg-brass',
  SIGNED: 'bg-foreground',
  DEAL_CREATED: 'bg-foreground',
  FULFILLED: 'bg-steel',
  OPEN: 'bg-brass',
  FUNDED: 'bg-ember',
  PAYOUT_RELEASED: 'bg-ember',
  DELIVERY_CONFIRMED: 'bg-foreground',
  AWAITING_REPAYMENT: 'bg-brass',
  READY_FOR_DISTRIBUTION: 'bg-ember',
  SETTLED: 'bg-steel',
  PENDING: 'bg-brass',
  CONFIRMED: 'bg-foreground',
  FAILED: 'bg-destructive',
  REFUNDED: 'bg-steel',
  CLAIMED: 'bg-steel',
};

export function prettyStatus(status) {
  return status?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || '';
}

export function StatusBadge({ status, className }) {
  const dot = STATUS_DOT[status] || 'bg-slate';
  const txt = STATUS_STYLES[status] || 'text-steel';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium', txt, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {prettyStatus(status)}
    </span>
  );
}

/* ---------- Progress bar (ember fill on mist track) ---------- */
export function ProgressBar({ value, max, className }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}>
      <div className="h-full rounded-full bg-ember transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Stat card (white surface, ember accent) ---------- */
export function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-slate">{label}</div>
          <div className="mt-2 font-heading text-2xl font-medium tracking-tight text-foreground">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate">{sub}</div>}
        </div>
        {Icon && (
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border', accent || 'text-foreground')}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16 text-center">
      {Icon && <Icon className="h-8 w-8 text-slate" strokeWidth={1.25} />}
      <h3 className="mt-4 font-heading text-lg font-medium">{title}</h3>
      {desc && <p className="mt-1 max-w-sm text-sm text-slate">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, desc, action, eyebrow }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-2 text-xs font-medium uppercase tracking-widest text-brass">{eyebrow}</div>}
        <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {desc && <p className="mt-2 max-w-2xl text-sm text-steel">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Info row ---------- */
export function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-slate">{label}</span>
      <span className={cn('text-right font-medium text-foreground', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}