import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Wallet, ArrowRight, ShieldCheck, Layers, LineChart, Zap, CheckCircle2, Users, FileSignature, Coins } from 'lucide-react';
import { useWallet } from '@/lib/wallet';

const ROLES = [
  { key: 'BUYER', title: 'Buyers', desc: 'Create purchase orders, raise funding against them, and repay after delivery.', icon: FileSignature },
  { key: 'SUPPLIER', title: 'Suppliers', desc: 'Sign POs cryptographically and get paid instantly once a deal is funded.', icon: Wallet },
  { key: 'INVESTOR', title: 'Investors', desc: 'Discover open deals, contribute USDC, earn yield, and claim your payout.', icon: LineChart },
  { key: 'ADMIN', title: 'Admins', desc: 'Release supplier payouts and oversee settlement across every deal.', icon: ShieldCheck },
];

const STEPS = [
  { n: '01', title: 'Buyer creates a Purchase Order', desc: 'The buyer drafts a PO and signs it with their wallet. The supplier reviews and countersigns — both parties are now committed on-chain.', icon: FileSignature },
  { n: '02', title: 'A funding Deal is launched', desc: 'The buyer opens a deal against the signed PO with a target amount, yield, and deadlines. A-Tokens are minted for contributors.', icon: Layers },
  { n: '03', title: 'Investors contribute USDC', desc: 'Investors fund the deal and receive A-Tokens 1:1. Deposits are verified before tokens mint — no IOUs, only proven capital.', icon: Coins },
  { n: '04', title: 'Supplier paid, buyer repays', desc: 'Funds release to the supplier. After delivery, the buyer repays principal + yield. Investors burn A-Tokens to claim their return.', icon: Zap },
];

const FLOW = [
  { t: 'PO signed', d: 'Buyer + supplier' },
  { t: 'Deal funded', d: 'Investors → USDC' },
  { t: 'Payout', d: 'Supplier paid' },
  { t: 'Delivery', d: 'Buyer confirms' },
  { t: 'Repay & claim', d: 'Yield distributed' },
];

export default function Landing() {
  const { connect, connecting, address } = useWallet();

  return (
    <div className="min-h-screen bg-card">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-card">
              <Layers className="h-5 w-5" />
            </div>
            <span className="font-heading text-lg font-semibold tracking-tight">ClearFlow</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how" className="font-heading text-sm font-medium text-steel hover:text-foreground transition-colors">How it works</a>
            <a href="#roles" className="font-heading text-sm font-medium text-steel hover:text-foreground transition-colors">Roles</a>
            <a href="#flow" className="font-heading text-sm font-medium text-steel hover:text-foreground transition-colors">Lifecycle</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Button size="sm" onClick={connect} disabled={connecting || !!address}>
              {address ? 'Wallet connected' : connecting ? 'Connecting…' : 'Connect wallet'}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-card">
        <div className="mx-auto max-w-[1200px] px-6 py-24 md:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-sm font-medium text-steel">
                <span className="flex h-2 w-2 rounded-full bg-ember animate-pulse" />
                Live on Base Sepolia · USDC settlement
              </div>
              <h1 className="font-heading text-5xl font-medium leading-[0.95] tracking-tight text-foreground md:text-6xl">
                Turn signed purchase orders into <span className="ember-underline">on-chain funding</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-steel">
                ClearFlow lets buyers raise working capital against their POs, pays suppliers the moment a deal funds, and gives investors verifiable yield — all secured by cryptographic signatures.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link to="/onboarding"><Button size="lg">Get started <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
                <a href="#how"><Button size="lg" variant="outline">See how it works</Button></a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate">
                <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> EIP-712 signed</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Verified deposits</span>
                <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> Instant payout</span>
              </div>
            </div>

            {/* Data card cluster */}
            <div className="relative hidden lg:block">
              <div className="grid gap-4">
                <div className="rounded-[20px] border border-border bg-card p-6">
                  <div className="text-xs font-medium uppercase tracking-widest text-slate">Total funded</div>
                  <div className="mt-2 font-heading text-4xl font-medium tracking-tight">$48.2M</div>
                  <div className="mt-4 flex h-20 items-end gap-1.5">
                    {[40, 55, 35, 70, 60, 85, 75, 95].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-ember/80" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-[20px] border border-border bg-card p-6">
                    <div className="text-xs font-medium uppercase tracking-widest text-slate">Avg. yield</div>
                    <div className="mt-2 font-heading text-3xl font-medium tracking-tight text-ember">8.5%</div>
                    <div className="mt-1 text-xs text-slate">APR across deals</div>
                  </div>
                  <div className="rounded-[20px] border border-border bg-secondary p-6">
                    <div className="text-xs font-medium uppercase tracking-widest text-slate">Investors</div>
                    <div className="mt-2 font-heading text-3xl font-medium tracking-tight">3,400+</div>
                    <div className="mt-1 text-xs text-slate">funding deals</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-background">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-medium tracking-tight">From PO to payout in four steps</h2>
            <p className="mt-3 text-steel">Every stage is signed, verified, and auditable on-chain.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-lg border border-border bg-card p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground">
                  <s.icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <div className="mt-5 font-heading text-xs font-medium tracking-widest text-ember">{s.n}</div>
                <h3 className="mt-1 font-heading text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-steel">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="bg-card">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-medium tracking-tight">Built for every party in the trade</h2>
            <p className="mt-3 text-steel">One platform, four roles — switch between them anytime from your dashboard.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.key} className="card-asymmetric rounded-lg border border-border bg-secondary p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground">
                  <r.icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h3 className="mt-5 font-heading text-lg font-medium">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-steel">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Flow diagram */}
      <section id="flow" className="bg-background">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-medium tracking-tight">The ClearFlow lifecycle</h2>
            <p className="mt-3 text-steel">Capital flows in a verified loop — no trust assumptions, only signatures.</p>
          </div>
          <div className="mt-14 rounded-lg border border-border bg-card p-8 md:p-12">
            <div className="grid items-center gap-6 md:grid-cols-9">
              {FLOW.map((node, i) => (
                <React.Fragment key={i}>
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground">
                      <CheckCircle2 className="h-7 w-7" strokeWidth={1.25} />
                    </div>
                    <div className="mt-3 font-heading text-sm font-medium">{node.t}</div>
                    <div className="text-xs text-slate">{node.d}</div>
                  </div>
                  {i < FLOW.length - 1 && <ArrowRight className="mx-auto hidden h-5 w-5 text-slate md:block" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-card">
        <div className="mx-auto max-w-[1200px] px-6 py-20">
          <div className="card-asymmetric rounded-lg bg-foreground px-8 py-16 text-center text-card md:px-16">
            <Users className="mx-auto h-10 w-10" strokeWidth={1.25} />
            <h2 className="mt-4 font-heading text-4xl font-medium tracking-tight">Ready to fund your next purchase order?</h2>
            <p className="mx-auto mt-3 max-w-xl text-card/70">Connect your wallet, pick a role, and start in minutes.</p>
            <Link to="/onboarding" className="mt-8 inline-block">
              <Button size="lg" variant="secondary">Start now <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-card">
              <Layers className="h-4 w-4" />
            </div>
            <span className="font-heading font-semibold">ClearFlow</span>
            <span className="text-sm text-slate">© 2026</span>
          </div>
          <div className="text-sm text-slate">PO invoicing & supply-chain finance, on-chain.</div>
        </div>
      </footer>
    </div>
  );
}