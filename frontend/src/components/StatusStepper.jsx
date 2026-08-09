import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

/**
 * Horizontal status stepper for PO and Deal flows.
 * steps: [{ key, label }]
 * current: the current status key
 */
export default function StatusStepper({ steps, current, completed = [] }) {
  const currentIndex = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {steps.map((s, i) => {
        const done = i < currentIndex || completed.includes(s.key);
        const active = s.key === current;
        const last = i === steps.length - 1;
        return (
          <div key={s.key} className="flex flex-1 items-start gap-3 sm:flex-col">
            <div className="flex items-center gap-3 sm:flex-col sm:items-center">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  active && 'border-ember bg-ember text-white',
                  done && !active && 'border-foreground bg-foreground text-white',
                  !active && !done && 'border-border bg-card text-slate'
                )}
              >
                {done && !active ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium sm:mt-2 sm:text-center',
                  active ? 'text-foreground' : done ? 'text-steel' : 'text-slate'
                )}
              >
                {s.label}
              </span>
            </div>
            {!last && (
              <div className="hidden flex-1 sm:block">
                <div className={cn('mx-3 h-px', i < currentIndex ? 'bg-foreground' : 'bg-border')} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const PO_STEPS = [
  { key: 'PENDING_SUPPLIER_SIGNATURE', label: 'Awaiting supplier signature' },
  { key: 'SIGNED', label: 'Signed' },
  { key: 'DEAL_CREATED', label: 'Deal launched' },
  { key: 'FULFILLED', label: 'Fulfilled' },
];

export const DEAL_STEPS = [
  { key: 'OPEN', label: 'Open for funding' },
  { key: 'FUNDED', label: 'Funded' },
  { key: 'PAYOUT_RELEASED', label: 'Payout released' },
  { key: 'DELIVERY_CONFIRMED', label: 'Delivery confirmed' },
  { key: 'AWAITING_REPAYMENT', label: 'Awaiting repayment' },
  { key: 'READY_FOR_DISTRIBUTION', label: 'Ready for distribution' },
  { key: 'SETTLED', label: 'Settled' },
];