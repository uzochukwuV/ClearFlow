import { db } from "@/api/db";
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { StatusBadge, ProgressBar, PageHeader, money, money2 } from '@/components/cf';
import { logActivity } from '@/lib/activity';
import { Loader2, ShieldCheck, ArrowLeft, Copy, CheckCircle2, Wallet, Clock } from 'lucide-react';

export default function Contribute() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { address, sign, shortAddr } = useWallet();
  const { toast } = useToast();
  const [deal, setDeal] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CRYPTO');
  const [stage, setStage] = useState('form');
  const [contribution, setContribution] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    db.entities.Deal.get(dealId).then(setDeal).catch(() => setDeal(null));
  }, [dealId]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const simulateVerify = async (contribId, amt) => {
    await new Promise((r) => setTimeout(r, 12000));
    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    await db.entities.Contribution.update(contribId, { status: 'CONFIRMED', txHash, tokenAmount: amt });
    const updated = await db.entities.Deal.get(dealId);
    const newTotal = (updated.runningTotal || 0) + amt;
    const newCount = (updated.investorCount || 0) + 1;
    const status = newTotal >= updated.targetAmount ? 'FUNDED' : 'OPEN';
    await db.entities.Deal.update(dealId, { runningTotal: newTotal, investorCount: newCount, status });
    await logActivity({ entityType: 'DEAL', entityId: dealId, action: 'CONTRIBUTION_CONFIRMED', label: `Deposit verified — ${amt.toLocaleString()} A-Tokens minted`, actorAddress: address, actorRole: 'INVESTOR', status, meta: { amount: amt, txHash } });
    await logActivity({ entityType: 'CONTRIBUTION', entityId: contribId, action: 'CONTRIBUTION_CONFIRMED', label: 'Deposit verified and tokens minted', actorAddress: address, actorRole: 'INVESTOR', status: 'CONFIRMED' });
    if (status === 'FUNDED') {
      await logActivity({ entityType: 'DEAL', entityId: dealId, action: 'STATUS_CHANGE', label: 'Deal reached its funding target', actorAddress: address, actorRole: 'SYSTEM', status: 'FUNDED' });
    }
    setContribution((c) => ({ ...c, status: 'CONFIRMED', txHash, tokenAmount: amt }));
    setStage('confirmed');
    setDeal((d) => d ? { ...d, runningTotal: newTotal, investorCount: newCount, status } : d);
    toast({ title: 'Deposit verified', description: `${amt.toLocaleString()} A-Tokens minted to your wallet.` });
  };

  const handleSubmit = async () => {
    if (!deal || !amount || Number(amount) <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (deal.status !== 'OPEN') {
      toast({ title: 'This deal is no longer accepting contributions', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const investorSignature = await sign();
      const created = await db.entities.Contribution.create({
        dealId,
        investorAddress: address,
        investorName: 'You',
        amount: Number(amount),
        paymentMethod: method,
        status: 'PENDING',
        atokenSymbol: deal.atokenSymbol,
        dealWalletAddress: deal.dealWalletAddress,
      });
      await logActivity({ entityType: 'DEAL', entityId: dealId, action: 'CONTRIBUTION_PENDING', label: `Investor committed ${money(Number(amount))} USDC — awaiting deposit`, actorAddress: address, actorRole: 'INVESTOR', status: 'OPEN', meta: { amount: Number(amount) } });
      await logActivity({ entityType: 'CONTRIBUTION', entityId: created.id, action: 'CONTRIBUTION_PENDING', label: 'Contribution submitted — awaiting deposit verification', actorAddress: address, actorRole: 'INVESTOR', status: 'PENDING' });
      setContribution(created);
      setStage('pending');
      toast({ title: 'Contribution submitted', description: 'Awaiting deposit verification…' });
      simulateVerify(created.id, Number(amount));
    } catch (e) {
      toast({ title: 'Could not submit contribution', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const copyAddr = () => {
    navigator.clipboard.writeText(deal?.dealWalletAddress || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!deal) return <div className="py-20 text-center text-slate">Loading deal…</div>;

  const pct = deal.targetAmount > 0 ? Math.round((deal.runningTotal / deal.targetAmount) * 100) : 0;
  const expectedReturn = Number(amount || 0) * (1 + deal.yield / 100);

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
      <PageHeader eyebrow="Invest" title={`Contribute to ${deal.atokenSymbol}`} desc={`${deal.yield}% APR · ${deal.buyerName}`} />

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="font-heading text-base font-medium">Funding progress</span>
            <StatusBadge status={deal.status} />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="font-heading text-3xl font-medium tracking-tight">{money(deal.runningTotal)}</span>
            <span className="text-sm text-slate">{pct}% of {money(deal.targetAmount)}</span>
          </div>
          <ProgressBar value={deal.runningTotal} max={deal.targetAmount} className="mt-3" />
          <div className="mt-2 text-xs text-slate">{deal.investorCount} investor{deal.investorCount === 1 ? '' : 's'}</div>
        </CardContent>
      </Card>

      {stage === 'form' && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <Label>Amount (USDC) *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
              {amount && <p className="text-xs text-slate">Expected return at maturity: <span className="font-medium text-ember">{money2(expectedReturn)}</span></p>}
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setMethod('CRYPTO')} className={`flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${method === 'CRYPTO' ? 'border-foreground bg-secondary text-foreground' : 'border-border text-slate'}`}>
                  <Wallet className="h-4 w-4" /> Crypto (USDC)
                </button>
                <button type="button" onClick={() => setMethod('FIAT')} className={`flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${method === 'FIAT' ? 'border-foreground bg-secondary text-foreground' : 'border-border text-slate'}`}>
                  <ShieldCheck className="h-4 w-4" /> Fiat (ramp)
                </button>
              </div>
            </div>
            <div className="rounded-md border border-border bg-secondary p-3 text-sm text-slate">
              You'll sign an EIP-712 message as <span className="font-mono">{shortAddr(address)}</span>. Tokens mint only after your deposit is verified in the deal wallet.
            </div>
            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing…</> : 'Sign & Contribute'}
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === 'pending' && contribution && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-brass">
                <Clock className="h-7 w-7 animate-pulse" />
              </div>
              <h3 className="mt-4 font-heading text-lg font-medium">Awaiting deposit confirmation</h3>
              <p className="mt-1 text-sm text-slate">Your contribution is pending until USDC lands in the deal wallet.</p>
            </div>
            {method === 'CRYPTO' && (
              <div className="rounded-md border border-border bg-secondary p-4">
                <div className="text-xs font-medium uppercase tracking-widest text-slate">Send exactly</div>
                <div className="mt-1 font-heading text-2xl font-medium">{money(Number(amount))} USDC</div>
                <div className="mt-3 text-xs font-medium uppercase tracking-widest text-slate">To deal wallet</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-card px-3 py-2 font-mono text-sm">{deal.dealWalletAddress}</code>
                  <Button size="sm" variant="outline" onClick={copyAddr}>{copied ? <CheckCircle2 className="h-4 w-4 text-ember" /> : <Copy className="h-4 w-4" />}</Button>
                </div>
                <p className="mt-3 text-xs text-slate">On Monad testnet. Verification runs automatically — no action needed.</p>
              </div>
            )}
            {method === 'FIAT' && (
              <div className="rounded-md border border-border bg-secondary p-4 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-foreground" />
                <p className="mt-2 text-sm text-slate">Cleanverse ramp widget would open here. We're simulating the fiat → USDC settlement.</p>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-sm text-slate">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying deposit…
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'confirmed' && contribution && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-ember">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-heading text-lg font-medium">Contribution Confirmed</h3>
              <p className="mt-1 text-sm text-slate">Deposit verified — A-Tokens minted to your wallet.</p>
            </div>
            <div className="space-y-2 rounded-md border border-border bg-secondary p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate">Amount</span><span className="font-medium">{money(Number(amount))} USDC</span></div>
              <div className="flex justify-between"><span className="text-slate">A-Tokens Received</span><span className="font-medium">{Number(amount).toLocaleString()} {deal.atokenSymbol}</span></div>
              <div className="flex justify-between"><span className="text-slate">Deposit Tx</span><span className="font-mono text-xs">{contribution.txHash?.slice(0, 14)}…</span></div>
              <div className="flex justify-between"><span className="text-slate">Yield Accruing</span><span className="font-medium">{deal.yield}% APR</span></div>
              <div className="flex justify-between"><span className="text-slate">Expected Return</span><span className="font-medium text-ember">{money2(expectedReturn)}</span></div>
            </div>
            <div className="flex gap-3">
              <Link to="/app/portfolio" className="flex-1"><Button variant="outline" className="w-full">View portfolio</Button></Link>
              <Link to="/app/deals/discover" className="flex-1"><Button className="w-full">Browse more</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}