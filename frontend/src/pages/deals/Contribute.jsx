import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import {
  useOpenDeals,
  useDealFundingSummary,
  useDeal,
  useContribution,
  useContributeToDeal,
} from '@/api/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { StatusBadge, ProgressBar, PageHeader, money, money2 } from '@/components/cf';
import { Loader2, ShieldCheck, ArrowLeft, Copy, CheckCircle2, Wallet, Clock, ExternalLink } from 'lucide-react';


function DetailItem({ label, value, mono = false }) {
  return (
    <div className="rounded-md border border-border bg-secondary p-3">
      <div className="text-[11px] uppercase tracking-widest text-slate">{label}</div>
      <div className={mono ? 'mt-1 font-mono text-sm break-all' : 'mt-1 text-sm'}>{value}</div>
    </div>
  );
}

export default function Contribute() {
  const { dealId } = useParams();
  const navigate = useNavigate();
  const { address, sign, shortAddr } = useWallet();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CRYPTO');
  const [stage, setStage] = useState('form');
  const [contributionId, setContributionId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [contributionMeta, setContributionMeta] = useState(null);

  const { data: openDealsResp, isLoading: openDealsLoading } = useOpenDeals();
  const { data: summaryResp, isLoading: summaryLoading } = useDealFundingSummary(dealId);
  const { data: dealDetailsResp, isLoading: dealDetailsLoading } = useDeal(dealId, sign, { enabled: !!dealId && !!address });
  const contributeToDeal = useContributeToDeal();
  const { data: contributionResp } = useContribution(contributionId, {
    refetchInterval: contributionId ? 8000 : false,
  });

  const deal = useMemo(() => {
    const deals = openDealsResp?.data?.deals || [];
    return deals.find((d) => d.dealId === dealId) || null;
  }, [openDealsResp, dealId]);
  console.log(dealDetailsResp)
  const summary = summaryResp?.summary || null;
  const liveContribution = contributionResp?.contribution || null;
  const dealInfo = dealDetailsResp?.data || deal;
  const dealBuyerAddress = dealInfo?.buyer?.address || dealInfo?.buyerAddress || deal?.buyerAddress || null;
  const dealSupplierAddress = dealInfo?.supplier?.address || dealInfo?.supplierAddress || deal?.supplierAddress || null;
  const dealWalletAddressInfo = dealInfo?.walletAddress || dealInfo?.circleWalletAddress || deal?.walletAddress || null;

  useEffect(() => {
    if (!liveContribution || stage !== 'pending') return;
    if (liveContribution.status === 'CONFIRMED') {
      const confirmedAmount = Number(liveContribution.amount || amount || 0);
      setStage('confirmed');
      toast({
        title: 'Deposit verified',
        description: `${confirmedAmount.toLocaleString()} A-Tokens minted to your wallet.`,
      });
    }
  }, [liveContribution, stage, amount, toast]);

  const handleSubmit = async () => {
    if (!dealId || !deal || !amount || Number(amount) <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!['OPEN', 'FUNDED'].includes(dealState)) {
      toast({ title: 'This deal is no longer accepting contributions', variant: 'destructive' });
      return;
    }
    if (!address) {
      toast({ title: 'Connect your wallet first', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await contributeToDeal.mutateAsync({
        dealId,
        investorAddress: address,
        params: {
          amount: String(amount),
          paymentMethod: method,
          fiatCurrency: 'USD',
          mintTokensOnConfirm: false,
        },
        signer: sign,
      });

      console.log('Contribution submission result:', result);

      const payload = result?.data || result || {};
      const nextContributionId = payload.contributionId;
      if (nextContributionId) setContributionId(nextContributionId);
      setContributionMeta(payload);
      setStage('pending');

      if (method === 'FIAT' && payload.rampWidgetUrl) {
        toast({
          title: 'Fiat ramp ready',
          description: 'Open the Cleanverse checkout to complete payment.',
        });
      } else {
        toast({
          title: 'Contribution submitted',
          description: 'Awaiting deposit verification?',
        });
      }
    } catch (e) {
      console.log('Error submitting contribution:', e);
      const errorDetails = e?.response?.data?.error?.details || e?.response?.data?.error?.message || e.message || 'Unknown error';
      toast({ title: 'Could not submit contribution', description: errorDetails, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openRampWidget = () => {
    const url = contributionMeta?.rampWidgetUrl || liveContribution?.rampWidgetUrl;
    if (!url) {
      toast({ title: 'Ramp checkout is not ready yet', variant: 'destructive' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyAddr = () => {
    const wallet = contributionMeta?.dealWalletAddress || liveContribution?.dealWalletAddress || '';
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayYield = dealInfo?.yield ?? dealInfo?.yieldPercent ?? 0;
  const targetAmount = summary ? Number(summary.targetAmount || 0) : Number(dealInfo?.targetAmount || 0);
  const fundedAmount = summary ? Number(summary.runningTotal || 0) : Number(dealInfo?.fundedAmount || 0);
  const pct = summary
    ? Math.round(summary.percentage || 0)
    : dealInfo?.fundedPercent || (targetAmount > 0 ? Math.round((fundedAmount / targetAmount) * 100) : 0);
  const expectedReturn = Number(amount || 0) * (1 + displayYield / 100);
  const dealWalletAddress =
    contributionMeta?.dealWalletAddress || liveContribution?.dealWalletAddress || dealWalletAddressInfo || null;
  const dealState = summary?.state || deal?.status || 'OPEN';
  const isLoading = openDealsLoading || summaryLoading || dealDetailsLoading || !deal;

  if (isLoading) {
    return (
      <div className="py-20 text-center text-slate">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      <PageHeader
        eyebrow="Invest"
        title={`Contribute to ${dealInfo.atokenSymbol}`}
        desc={`${displayYield}% APR ? ${dealBuyerAddress ? `${dealBuyerAddress.slice(0, 8)}?` : 'Unknown buyer'}`}
      />

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <span className="font-heading text-base font-medium">Funding progress</span>
            <StatusBadge status={dealState} />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <span className="font-heading text-3xl font-medium tracking-tight">{money(fundedAmount)}</span>
            <span className="text-sm text-slate">{pct}% of {money(targetAmount)}</span>
          </div>
          <ProgressBar value={fundedAmount} max={targetAmount} className="mt-3" />
          <div className="mt-2 text-xs text-slate">
            {summary?.investorCount ?? 0} investor{(summary?.investorCount ?? 0) === 1 ? '' : 's'}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <span className="font-heading text-base font-medium">Deal details</span>
            <span className="text-xs text-slate">What you are funding</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Purchase order" value={dealInfo.purchaseOrderId || '?'} mono />
            <DetailItem label="Buyer" value={dealBuyerAddress || '?'} mono />
            <DetailItem label="Supplier" value={dealSupplierAddress || '?'} mono />
            <DetailItem label="Deal wallet" value={dealWalletAddress || 'Waiting for wallet...'} mono />
            <DetailItem label="Target amount" value={money(targetAmount)} />
            <DetailItem label="PO amount" value={money(Number(dealInfo.poAmount || targetAmount || 0))} />
            <DetailItem label="Funding deadline" value={dealInfo.fundingDeadline ? new Date(dealInfo.fundingDeadline).toLocaleDateString() : '?'} />
            <DetailItem label="Delivery deadline" value={dealInfo.deliveryDeadline ? new Date(dealInfo.deliveryDeadline).toLocaleDateString() : '?'} />
            <DetailItem label="Minimum tier" value={`Tier ${dealInfo.minInvestorTier ?? 1}`} />
            <DetailItem label="Eligible countries" value={(dealInfo.eligibleCountries || []).length ? (dealInfo.eligibleCountries || []).join(', ') : 'All supported'} />
            <DetailItem label="Deal status" value={dealState} />
            <DetailItem label="A-Token" value={dealInfo.atokenSymbol || '?'} mono />
          </div>
          <div className="rounded-md border border-border bg-secondary p-3 text-sm text-slate">
            This deal is backed by the PO buyer and settled through the Circle deal wallet. After contribution, the backend verifies the deposit and mints A-Tokens when the transfer is confirmed.
          </div>
        </CardContent>
      </Card>

      {stage === 'form' && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-2">
              <Label>Amount (USDC) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
              />
              {amount && (
                <p className="text-xs text-slate">
                  Expected return at maturity:{' '}
                  <span className="font-medium text-ember">{money2(expectedReturn)}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMethod('CRYPTO')}
                  className={`flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${method === 'CRYPTO' ? 'border-foreground bg-secondary text-foreground' : 'border-border text-slate'}`}
                >
                  <Wallet className="h-4 w-4" /> Crypto (USDC)
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('FIAT')}
                  className={`flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors ${method === 'FIAT' ? 'border-foreground bg-secondary text-foreground' : 'border-border text-slate'}`}
                >
                  <ShieldCheck className="h-4 w-4" /> Fiat (ramp)
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-secondary p-3 text-sm text-slate">
              You?ll sign a contribution message as <span className="font-mono">{shortAddr(address)}</span>.
              {method === 'CRYPTO'
                ? ' After submission, send USDC directly to the deal wallet and the backend will verify the transfer.'
                : ' After submission, the Cleanverse checkout opens and the backend verifies the ramp settlement.'}
            </div>

            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing?</> : 'Sign & Contribute'}
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === 'pending' && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-brass">
                <Clock className="h-7 w-7 animate-pulse" />
              </div>
              <h3 className="mt-4 font-heading text-lg font-medium">Awaiting deposit confirmation</h3>
              <p className="mt-1 text-sm text-slate">
                {method === 'CRYPTO'
                  ? 'Your contribution is pending until USDC lands in the deal wallet.'
                  : 'Your contribution is pending until the Cleanverse ramp finishes settlement.'}
              </p>
            </div>

            {method === 'CRYPTO' && (
              <div className="rounded-md border border-border bg-secondary p-4">
                <div className="text-xs font-medium uppercase tracking-widest text-slate">Send exactly</div>
                <div className="mt-1 font-heading text-2xl font-medium">{money(Number(amount))} USDC</div>
                <div className="mt-3 text-xs font-medium uppercase tracking-widest text-slate">To deal wallet</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-card px-3 py-2 font-mono text-sm">
                    {dealWalletAddress || 'Waiting for deal wallet address?'}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyAddr} disabled={!dealWalletAddress}>
                    {copied ? <CheckCircle2 className="h-4 w-4 text-ember" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="mt-3 text-xs text-slate">
                  On Base Sepolia. Verification runs automatically ? no action needed.
                </p>
              </div>
            )}

            {method === 'FIAT' && (
              <div className="rounded-md border border-border bg-secondary p-4 space-y-4 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-foreground" />
                <div>
                  <p className="text-sm text-slate">The contribution was created successfully.</p>
                  <p className="text-sm text-slate">Open the Cleanverse checkout to complete payment.</p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate">
                  {contributionMeta?.rampOrderId && <span className="rounded-full border border-border px-2 py-1">Order: {contributionMeta.rampOrderId}</span>}
                  {contributionMeta?.rampQuoteToken && <span className="rounded-full border border-border px-2 py-1">Quote: {contributionMeta.rampQuoteToken}</span>}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openRampWidget}
                  disabled={!contributionMeta?.rampWidgetUrl}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" /> Open ramp checkout
                </Button>
                {!contributionMeta?.rampWidgetUrl && (
                  <p className="text-xs text-slate">Checkout URL is still being prepared by the backend.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-sm text-slate">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying deposit?
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'confirmed' && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-ember">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-heading text-lg font-medium">Contribution Confirmed</h3>
              <p className="mt-1 text-sm text-slate">Deposit verified ? A-Tokens minted to your wallet.</p>
            </div>
            <div className="space-y-2 rounded-md border border-border bg-secondary p-4 text-sm">
              <div className="flex justify-between"><span className="text-slate">Amount</span><span className="font-medium">{money(Number(amount))} USDC</span></div>
              <div className="flex justify-between"><span className="text-slate">A-Tokens Received</span><span className="font-medium">{Number(amount).toLocaleString()} {deal.atokenSymbol}</span></div>
              <div className="flex justify-between"><span className="text-slate">Deal wallet</span><span className="font-mono text-xs">{(dealWalletAddress || '').slice(0, 14)}?</span></div>
              <div className="flex justify-between"><span className="text-slate">Yield Accruing</span><span className="font-medium">{displayYield}% APR</span></div>
              <div className="flex justify-between"><span className="text-slate">Expected Return</span><span className="font-medium text-ember">{money2(expectedReturn)}</span></div>
            </div>
            <div className="flex gap-3">
              <Link to="/app/portfolio" className="flex-1">
                <Button variant="outline" className="w-full">View portfolio</Button>
              </Link>
              <Link to="/app/deals/discover" className="flex-1">
                <Button className="w-full">Browse more</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
