/**
 * End-to-end test for the unified verified-deposit pipeline.
 *
 * Verifies the core invariant: a Contribution starts PENDING and only flips
 * to CONFIRMED once USDC is proven to have landed in the deal wallet on-chain.
 *
 * Flow:
 *  1. Use (or create) a Circle deal wallet on MONAD-TESTNET.
 *  2. Record a CRYPTO Contribution against it via DepositVerificationService
 *     primitives (we create the row directly to avoid the full HTTP signature
 *     flow; the verification logic under test is identical).
 *  3. Confirm it is PENDING and verifyCryptoDeposit() returns not-yet-verified
 *     before any funds move.
 *  4. Send USDC on-chain from the ADMIN wallet to the deal wallet.
 *  5. Poll verifyCryptoDeposit() until it reports verified == true and the
 *     Contribution row is CONFIRMED with txHash + confirmedAt set.
 *
 * Requires: a running Postgres with the schema applied, .env loaded, and
 * recovery/wallet.json present.
 *
 * Usage: npx tsx scripts/test-verified-deposit.ts [dealWalletId]
 */
import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets';
import { prisma } from '../src/config/database';
import { getDepositVerificationService } from '../src/services/funding';
import { ContributionStatus, ContributionType } from '@prisma/client';

const RPC = process.env.MONAD_RPC_URL || 'https://rpc.ankr.com/monad_testnet';
const USDC = process.env.MONAD_USDC_ADDRESS || '0x534b2f3A21130d7a60830c2Df862319e593943A3';
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
const AMOUNT_USDC = '2'; // 2 USDC test deposit

const walletFile = JSON.parse(readFileSync('recovery/wallet.json', 'utf8'));
const ADMIN = walletFile.wallets.find((w: any) => w.role === 'ADMIN');
const ADMIN_ADDR: string = ADMIN.address;
const ADMIN_KEY: string = ADMIN.privateKey;

const apiKey = process.env.CIRCLE_API_KEY!;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET!.replace(/["']/g, '');
const walletSetId = process.env.CIRCLE_WALLET_SET_ID!;
const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey,
  entitySecret,
  baseUrl: process.env.CIRCLE_BASE_URL,
});

const provider = new ethers.JsonRpcProvider(RPC);
const adminWallet = new ethers.Wallet(ADMIN_KEY, provider);

function short(addr: string) {
  return addr.slice(0, 8) + '…' + addr.slice(-4);
}
async function usdcBal(addr: string): Promise<string> {
  const c = new ethers.Contract(USDC, USDC_ABI, provider);
  return ethers.formatUnits(await c.balanceOf(addr), 6);
}

async function ensureDealWallet(existingWalletId?: string): Promise<{ walletId: string; address: string }> {
  if (existingWalletId) {
    const res = await circleClient.getWallet({ id: existingWalletId });
    const w = (res as any).data?.wallet;
    if (!w) throw new Error(`Wallet ${existingWalletId} not found`);
    return { walletId: existingWalletId, address: w.address };
  }
  console.log('Creating fresh Circle deal wallet on MONAD-TESTNET…');
  const res = await circleClient.createWallet({
    walletSetId,
    count: 1,
    blockchain: 'MONAD-TESTNET',
  });
  const w = (res as any).data?.wallets?.[0];
  if (!w) throw new Error('Wallet creation returned no wallet');
  console.log(`  ✓ wallet ${w.id} @ ${short(w.address)}`);
  return { walletId: w.id, address: w.address };
}

async function main() {
  const existingWalletId = process.argv[2];
  console.log('\n=== Verified Deposit E2E ===');
  console.log(`ADMIN:   ${short(ADMIN_ADDR)}`);
  console.log(`RPC:     ${RPC}`);
  console.log(`USDC:    ${USDC}`);
  console.log(`Amount:  ${AMOUNT_USDC} USDC\n`);

  // 1. Deal wallet
  const { walletId, address: dealWalletAddress } = await ensureDealWallet(existingWalletId);
  console.log(`Deal wallet: ${walletId} @ ${short(dealWalletAddress)}`);
  const balBefore = await usdcBal(dealWalletAddress);
  console.log(`  USDC balance before: ${balBefore}`);

  // 2. Create a synthetic PurchaseOrder + Deal so the Contribution FK is valid.
  //    (In production these are created by the PO + dealService.createDeal flows.)
  let buyer = await prisma.user.findUnique({ where: { walletAddress: ADMIN_ADDR.toLowerCase() } });
  if (!buyer) {
    buyer = await prisma.user.create({
      data: { walletAddress: ADMIN_ADDR.toLowerCase(), userType: 'INVESTOR' },
    });
  }
  const supplier = await prisma.user.create({
    data: { walletAddress: ('0x' + randomUUID().slice(0, 40)).toLowerCase(), userType: 'SUPPLIER' },
  });
  const po = await prisma.purchaseOrder.create({
    data: {
      poReference: `test-po-${randomUUID()}`,
      buyerId: buyer.id,
      supplierId: supplier.id,
      amount: '1000',
      currency: 'USD',
      quantity: 1,
      advanceAmount: '500',
      advancePercent: 50,
      deliveryDate: new Date(Date.now() + 60 * 86400 * 1000),
      status: 'SIGNED',
    },
  });
  const deal = await prisma.deal.create({
    data: {
      purchaseOrderId: po.id,
      chain: 'monad',
      targetAmount: 1000,
      runningTotal: 0,
      currency: 'USDC',
      fundingDeadline: new Date(Date.now() + 30 * 86400 * 1000),
      yieldPercent: 5,
      status: 'OPEN',
      minInvestorTier: 1,
      eligibleCountries: [],
      circleWalletId: walletId,
      circleWalletAddress: dealWalletAddress,
      totalSupply: 0,
    },
  });
  console.log(`Created synthetic deal: ${deal.id}`);

  const investor = buyer;

  // 3. Record a PENDING CRYPTO contribution.
  const contribution = await prisma.contribution.create({
    data: {
      dealId: deal.id,
      investorId: investor.id,
      amount: AMOUNT_USDC,
      currency: 'USDC',
      type: ContributionType.CRYPTO,
      status: ContributionStatus.PENDING,
      fromAddress: ADMIN_ADDR.toLowerCase(),
      toAddress: dealWalletAddress,
    },
  });
  console.log(`\nContribution ${contribution.id} created — status: ${contribution.status}`);

  // 4. Verify it is NOT yet verified (no funds have moved).
  const verificationService = getDepositVerificationService();
  const preCheck = await verificationService.verifyCryptoDeposit(contribution.id);
  console.log(`Pre-deposit verifyCryptoDeposit(): verified=${preCheck.verified} (${preCheck.error})`);
  if (preCheck.verified) {
    console.log('⚠️  Already verified before sending funds — unexpected (balance may already cover it).');
  }

  // 5. Send USDC on-chain from ADMIN → deal wallet.
  console.log(`\nSending ${AMOUNT_USDC} USDC from ADMIN → deal wallet on-chain…`);
  const usdc = new ethers.Contract(USDC, USDC_ABI, adminWallet);
  const amountWei = ethers.parseUnits(AMOUNT_USDC, 6);
  const tx = await usdc.transfer(dealWalletAddress, amountWei);
  console.log(`  tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`  ✓ confirmed in block ${receipt?.blockNumber}`);

  // 6. Poll verifyCryptoDeposit() until verified.
  console.log('\nPolling DepositVerificationService until verified…');
  const result = await verificationService.pollUntilVerified(contribution.id, {
    maxAttempts: 30,
    intervalMs: 8000,
  });

  const finalContribution = await prisma.contribution.findUnique({
    where: { id: contribution.id },
  });
  const finalBal = await usdcBal(dealWalletAddress);

  console.log('\n=== Result ===');
  console.log(`pollUntilVerified: verified=${result.verified} ${result.error ? '(' + result.error + ')' : ''}`);
  console.log(`Contribution status: ${finalContribution?.status}`);
  console.log(`Contribution txHash:  ${finalContribution?.txHash}`);
  console.log(`Contribution confirmedAt: ${finalContribution?.confirmedAt}`);
  console.log(`Deal wallet USDC balance: ${finalBal}`);

  const ok =
    result.verified &&
    finalContribution?.status === ContributionStatus.CONFIRMED &&
    !!finalContribution?.txHash &&
    !!finalContribution?.confirmedAt;

  console.log(`\n${ok ? '✅ PASS — deposit verified before token mint' : '❌ FAIL'}`);

  // Cleanup: delete synthetic rows so the DB is left clean.
  await prisma.contribution.deleteMany({ where: { dealId: deal.id } });
  await prisma.deal.delete({ where: { id: deal.id } });
  await prisma.purchaseOrder.delete({ where: { id: po.id } });
  await prisma.user.deleteMany({ where: { id: supplier.id } });
  console.log('Cleaned up synthetic deal + contribution + PO.');

  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('E2E test error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
