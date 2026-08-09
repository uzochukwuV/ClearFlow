import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useWallet } from '@/lib/wallet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Layers,
  FileSignature,
  Wallet,
  LineChart,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { useOnboardIdentity, useIdentityStatus } from '@/api/hooks';
import { COUNTRIES } from '@/lib/countries';
import { generateCustomerId, isApassActive, isApassFrozen } from '@/lib/identity';

const ID_TYPES = [
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'ID_CARD', label: 'ID Card' },
  { value: 'DRIVER_LICENSE', label: "Driver's License" },
  { value: 'RESIDENCE_PERMIT', label: 'Residence Permit' },
];

// Self-onboardable roles. ADMIN is excluded — the admin is a Circle
// developer-controlled wallet configured via env, not a self-service role.
const ROLES = [
  { key: 'BUYER', title: 'Buyer', desc: 'Create POs and raise funding', icon: FileSignature },
  { key: 'SUPPLIER', title: 'Supplier', desc: 'Sign POs and receive payout', icon: Wallet },
  { key: 'INVESTOR', title: 'Investor', desc: 'Fund deals and earn yield', icon: LineChart },
];

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // 60s

export default function Onboarding() {
  const navigate = useNavigate();
  const { connect, connecting, address, shortAddr, sign, setRole: persistRole, hasWallet, error: walletError } = useWallet();
  const { markOnboarded } = useAuth();
  const { toast } = useToast();
  const onboard = useOnboardIdentity();
  const identityStatus = useIdentityStatus();

  const [step, setStep] = useState(0); // 0=connect, 1=role, 2=kyc, 3=verifying
  const [selectedRole, setSelectedRole] = useState(null);
  const [fullName, setFullName] = useState('');
  const [idType, setIdType] = useState('');
  const [country, setCountry] = useState('');
  const [email, setEmail] = useState('');
  const [preflighting, setPreflighting] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  const pollTimer = useRef(null);

  // ---- Pre-flight: when a wallet connects, check if the user is already
  // onboarded. If their A-Pass is active, skip straight to /app. If registered
  // but role unknown, skip to role selection. ----
  const preflight = useCallback(async () => {
    if (!address || !sign) return;
    setPreflighting(true);
    try {
      const result = await identityStatus.mutateAsync({ walletAddress: address, signer: sign });
      if (result?.registered && isApassActive(result.status)) {
        // Already onboarded + active → go to app.
        persistRole(localStorage.getItem('clearflow_role'));
        markOnboarded({ apassId: result.apassId, status: result.status, tier: result.tier });
        navigate('/app');
        return;
      }
      if (result?.registered) {
        // Registered but maybe pending/frozen — let them pick a role at least.
        setStep(1);
        return;
      }
      // Not registered → proceed to role selection.
      setStep(1);
    } catch {
      // Status check failed (backend down, etc.) — don't block onboarding.
      setStep(1);
    } finally {
      setPreflighting(false);
    }
  }, [address, sign, identityStatus, navigate, persistRole]);

  useEffect(() => {
    if (address) preflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Cleanup polling on unmount.
  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const handleConnect = async () => {
    try {
      await connect();
      // preflight() fires via the address useEffect above.
    } catch (e) {
      toast({ title: 'Could not connect wallet', description: e?.message, variant: 'destructive' });
    }
  };

  const handleRole = (r) => {
    setSelectedRole(r);
    setStep(2);
  };

  // ---- Submit KYC: sign ONBOARD message → POST /identity/onboard → step 3 (poll) ----
  const handleSubmit = async () => {
    if (!fullName.trim() || !idType || !country) {
      toast({ title: 'Please complete all required fields', variant: 'destructive' });
      return;
    }
    if (!address || !sign) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }

    const customerId = generateCustomerId(address);
    const identityDataList = [
      {
        idType,
        fullName: fullName.trim(),
        issuingCountryISO2: country,
      },
    ];

    try {
      const result = await onboard.mutateAsync({
        params: {
          userType: selectedRole,
          customerId,
          identityDataList,
          chain: 'base',
        },
        signer: sign,
      });

      if (result?.apassId) {
        toast({
          title: 'Identity submitted',
          description: 'Your A-Pass is being verified.',
        });
        setStep(3);
        setPollAttempts(0);
        startPolling();
      } else {
        // Onboard returned success but no apassId — treat as soft success.
        persistRole(selectedRole);
        markOnboarded({ status: 'PENDING' });
        navigate('/app');
      }
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Onboarding failed';
      toast({ title: 'Onboarding failed', description: msg, variant: 'destructive' });
    }
  };

  // ---- Poll /identity/status until ACTIVE/FROZEN or timeout ----
  const startPolling = useCallback(() => {
    const poll = async () => {
      setPollAttempts((n) => n + 1);
      try {
        const result = await identityStatus.mutateAsync({ walletAddress: address, signer: sign });
        if (isApassActive(result?.status)) {
          persistRole(selectedRole);
          markOnboarded({ apassId: result.apassId, status: result.status, tier: result.tier });
          toast({ title: 'Welcome to ClearFlow', description: 'Your identity is verified.' });
          navigate('/app');
          return;
        }
        if (isApassFrozen(result?.status)) {
          toast({
            title: 'Account frozen',
            description: 'Your A-Pass is frozen. Please contact support.',
            variant: 'destructive',
          });
          return; // stop polling
        }
        // Still pending — schedule next poll if within budget.
        setPollAttempts((n) => {
          if (n < POLL_MAX_ATTEMPTS) {
            pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
          } else {
            // Timeout — soft success (A-Pass may activate later via webhook).
            persistRole(selectedRole);
            markOnboarded({ status: 'PENDING' });
            toast({
              title: 'Verification pending',
              description: 'Your identity is still being verified. You can browse — we will notify you when active.',
            });
            navigate('/app');
          }
          return n;
        });
      } catch {
        setPollAttempts((n) => {
          if (n < POLL_MAX_ATTEMPTS) {
            pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
          return n;
        });
      }
    };
    poll();
  }, [address, sign, identityStatus, selectedRole, persistRole, markOnboarded, navigate, toast]);

  const submitting = onboard.isPending;
  const kycValid = fullName.trim() && idType && country;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-card">
              <Layers className="h-4 w-4" />
            </div>
            <span className="font-heading text-base font-semibold tracking-tight">ClearFlow</span>
          </Link>
          <div className="flex items-center gap-2 text-sm text-slate">
            Step {Math.min(step + 1, 4)} of 4
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Step 0: Connect wallet */}
        {step === 0 && (
          <Card className="mx-auto max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-card">
                <Wallet className="h-7 w-7" />
              </div>
              <CardTitle className="mt-4 font-heading text-2xl font-medium">Connect your wallet</CardTitle>
              <CardDescription>
                ClearFlow uses your wallet to cryptographically sign purchase orders, deals, and your identity verification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {address ? (
                <div className="rounded-md border border-border bg-secondary p-4 text-center">
                  {preflighting ? (
                    <>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-foreground" />
                      <div className="mt-2 font-medium">Checking your identity…</div>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mx-auto h-6 w-6 text-ember" />
                      <div className="mt-2 font-medium">Wallet connected</div>
                      <div className="font-mono text-sm text-slate">{shortAddr(address)}</div>
                      <Button className="mt-4 w-full" onClick={() => setStep(1)}>
                        Continue <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {!hasWallet ? (
                    <div className="space-y-3 text-center">
                      <AlertCircle className="mx-auto h-8 w-8 text-slate" />
                      <p className="text-sm text-steel">
                        No wallet extension detected. Install MetaMask to continue.
                      </p>
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block"
                      >
                        <Button variant="outline">Get MetaMask</Button>
                      </a>
                    </div>
                  ) : (
                    <Button className="w-full" size="lg" onClick={handleConnect} disabled={connecting || preflighting}>
                      {connecting || preflighting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…
                        </>
                      ) : (
                        'Connect wallet'
                      )}
                    </Button>
                  )}
                  {walletError && (
                    <p className="mt-3 text-sm text-destructive">{walletError}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 1: Choose role */}
        {step === 1 && (
          <div>
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="font-heading text-4xl font-medium tracking-tight">Choose your role</h1>
              <p className="mt-3 text-steel">
                You can act as any party in a trade. Pick one to set up your dashboard — switch anytime later.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => handleRole(r.key)}
                  className="group flex items-start gap-4 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-foreground hover:bg-secondary"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground group-hover:border-foreground group-hover:bg-foreground group-hover:text-card">
                    <r.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-heading font-medium">{r.title}</div>
                    <div className="text-sm text-slate">{r.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Identity verification (KYC) */}
        {step === 2 && (
          <Card className="mx-auto max-w-lg">
            <CardHeader>
              <CardTitle className="font-heading text-2xl font-medium">Verify your identity</CardTitle>
              <CardDescription>
                ClearFlow issues a Cleanverse A-Pass (on-chain identity credential) for your wallet.
                You will sign a message to authorize it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name on ID</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="idType">ID type</Label>
                <Select value={idType} onValueChange={setIdType}>
                  <SelectTrigger id="idType">
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Issuing country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger id="country">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              <div className="rounded-md border border-border bg-secondary p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate">Wallet</span>
                  <span className="font-mono">{shortAddr(address)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-slate">Role</span>
                  <span className="font-medium">{selectedRole}</span>
                </div>
              </div>
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-xs text-steel flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
                <span>
                  You will be asked to sign a message in your wallet. This signature authorizes ClearFlow
                  to issue your A-Pass — it does not give access to your funds.
                </span>
              </div>
              <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting || !kycValid}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    Sign & verify <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Verifying */}
        {step === 3 && (
          <Card className="mx-auto max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-7 w-7 animate-spin" />
              </div>
              <CardTitle className="mt-4 font-heading text-2xl font-medium">Verifying your identity</CardTitle>
              <CardDescription>
                Your A-Pass is being issued on Base Sepolia. This usually takes a few seconds.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-secondary p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate">Wallet</span>
                  <span className="font-mono">{shortAddr(address)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate">Role</span>
                  <span className="font-medium">{selectedRole}</span>
                </div>
              </div>
              <p className="text-xs text-slate text-center">
                Checking status… (attempt {Math.min(pollAttempts, POLL_MAX_ATTEMPTS)} of {POLL_MAX_ATTEMPTS})
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}