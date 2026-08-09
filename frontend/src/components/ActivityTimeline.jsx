import React from 'react';
import { cn } from '@/lib/utils';
import { prettyStatus } from '@/components/cf';
import { useWallet } from '@/lib/wallet';

const ACTION_ICONS = {
  PO_CREATED: 'FilePlus',
  PO_SIGNED: 'PenLine',
  DEAL_LAUNCHED: 'Rocket',
  CONTRIBUTION_PENDING: 'Clock',
  CONTRIBUTION_CONFIRMED: 'CheckCircle2',
  PAYOUT_RELEASED: 'Send',
  DELIVERY_CONFIRMED: 'Truck',
  REPAYMENT_MADE: 'DollarSign',
  CLAIM_MADE: 'Gift',
  STATUS_CHANGE: 'ArrowRightLeft',
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ActivityTimeline({ events = [], loading }) {
  const { shortAddr } = useWallet();

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 rounded bg-secondary" />
              <div className="h-2.5 w-1/3 rounded bg-secondary" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-slate">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-5">
      {events.map((e, i) => {
        const isLatest = i === 0;
        return (
          <li key={e.id} className="relative flex gap-4">
            {/* connector */}
            {i < events.length - 1 && (
              <span className="absolute left-[5px] top-4 h-[calc(100%+4px)] w-px bg-border" />
            )}
            <span
              className={cn(
                'relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-card',
                isLatest ? 'bg-ember' : 'bg-slate'
              )}
            />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-foreground">{e.label}</span>
                <span className="shrink-0 text-xs text-slate">{timeAgo(e.created_date)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">
                <span className="uppercase tracking-wider">{(e.actorRole || 'system').toLowerCase()}</span>
                {e.actorAddress && <span className="font-mono">{shortAddr(e.actorAddress)}</span>}
                {e.status && (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-brass" />
                    {prettyStatus(e.status)}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}