/**
 * End-to-end Circle deal wallet test on Monad testnet.
 *
 * Flow:
 *  1. Create a Circle developer-controlled deal wallet (MONAD-TESTNET).
 *  2. Fund it on-chain from the ADMIN wallet (USDC + a little MON for gas)
 *     using ethers v6 + the Ankr Monad testnet RPC. ADMIN key from wallet.json.
 *  3. Transfer USDC from the deal wallet back out to the SUPPLIER wallet
 *     via the Circle createTransaction API (Circle signs the custodial key).
 *  4. Verify the SUPPLIER received the funds via RPC.
 *
 * Usage: npx tsx scripts/test-e2e-monad.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { randomUUID } from 'crypto';
import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets';
import { readFileSync } from 'fs';

const RPC = process.env.MONAD_RPC_URL || 'https://rpc.ankr.com/monad_testnet';
const USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3'; // Monad testnet USDC, 6 decimals
const USDC_ABI = ['function transfer(address to, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)'];

const walletFile = JSON.parse(readFileSync('recovery/wallet.json', 'utf8'));
const ADMIN = walletFile.wallets.find((w: any) => w.role === 'ADMIN');
const SUPPLIER = walletFile.wallets.find((w: any) => w.role === 'SUPPLIER');
const ADMIN_ADDR = ADMIN.address;
const ADMIN_KEY = ADMIN.privateKey;
const SUPPLIER_ADDR = SUPPLIER.address;

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

function short(addr: string) { return addr.slice(0, 8) + '…' + addr.slice(-4); }

async function rpcBal(addr: string) {
  const provider2 = new ethers.JsonRpcProvider(RPC);
  const mon = await provider2.getBalance(addr);
  const usdc = new ethers.Contract(USDC, USDC_ABI, provider2);
  const u = await usdc.balanceOf(addr);
  return { mon: ethers.formatEther(mon), usdc: ethers.formatUnits(u, 6) };
}

async function waitForFunds(addr: string, opts: { minUsdc: number; minMon: number; timeoutMs: number }) {
  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const b = await rpcBal(addr);
    if (parseFloat(b.usdc) >= opts.minUsdc && parseFloat(b.mon) >= opts.minMon) return b;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error(`Timed out waiting for funds on ${addr}`);
}

async function main() {
  console.log('=== Balances before ===');
  const adminBefore = await rpcBal(ADMIN_ADDR);
  const supplierBefore = await rpcBal(SUPPLIER_ADDR);
  console.log('ADMIN   :', adminBefore);
  console.log('SUPPLIER:', supplierBefore);

  // 1. Create Circle deal wallet on MONAD-TESTNET
  console.log('\n=== 1. Create Circle deal wallet (MONAD-TESTNET) ===');
  const dealId = 'e2e-deal-' + Date.now();
  const createRes = await circleClient.createWallets({
    idempotencyKey: randomUUID(),
    blockchains: ['MONAD-TESTNET' as any],
    count: 1,
    walletSetId,
    accountType: 'EOA',
    metadata: [{ refId: `deal-${dealId}` }],
  } as any);
  const dealWallet = (createRes as any).data?.wallets?.[0];
  if (!dealWallet?.id || !dealWallet?.address) {
    throw new Error('Failed to create deal wallet: ' + JSON.stringify((createRes as any).data));
  }
  const DEAL_WALLET_ID = dealWallet.id;
  const DEAL_ADDR = dealWallet.address;
  console.log('dealWalletId :', DEAL_WALLET_ID);
  console.log('dealAddress  :', DEAL_ADDR, '(' + dealWallet.blockchain + ')');

  // 2. Fund deal wallet from admin: 5 USDC + 0.2 MON (gas)
  console.log('\n=== 2. Fund deal wallet from admin (5 USDC + 0.2 MON) ===');
  const usdc = new ethers.Contract(USDC, USDC_ABI, adminWallet);

  const monTx = await adminWallet.sendTransaction({
    to: DEAL_ADDR,
    value: ethers.parseEther('0.2'),
  });
  console.log('MON tx sent:', monTx.hash, '- waiting for confirmation...');
  await monTx.wait();
  console.log('MON tx confirmed.');

  const usdcAmount = ethers.parseUnits('5', 6);
  const usdcTx = await usdc.transfer(DEAL_ADDR, usdcAmount);
  console.log('USDC tx sent:', usdcTx.hash, '- waiting for confirmation...');
  await usdcTx.wait();
  console.log('USDC tx confirmed.');

  console.log('\nWaiting for deal wallet to reflect funds...');
  const dealBal = await waitForFunds(DEAL_ADDR, { minUsdc: 4, minMon: 0.1, timeoutMs: 60000 });
  console.log('Deal wallet funded:', dealBal);

  // 3. Transfer 2 USDC from deal wallet -> SUPPLIER via Circle API
  console.log('\n=== 3. Transfer 2 USDC from deal wallet -> SUPPLIER via Circle ===');
  const transferRes = await circleClient.createTransaction({
    amount: ['2'],
    walletId: DEAL_WALLET_ID,
    destinationAddress: SUPPLIER_ADDR,
    blockchain: 'MONAD-TESTNET' as any,
    fee: {
      type: 'level',
      config: { feeLevel: 'HIGH' },
    },
    tokenAddress: USDC,
  } as any);
  const txn = (transferRes as any).data?.transaction ?? (transferRes as any).data;
  const transferId = txn?.id;
  const state = txn?.state;
  console.log('Circle transfer initiated:');
  console.log('  transferId:', transferId);
  console.log('  state     :', state);
  console.log('  txHash    :', txn?.txHash);

  // 4. Poll transaction status + verify supplier balance
  console.log('\n=== 4. Wait for transfer to complete + verify supplier ===');
  let finalTxn = txn;
  const pollStart = Date.now();
  while (Date.now() - pollStart < 120000) {
    const status = await circleClient.getTransaction({ id: transferId });
    const t = (status as any).data?.transaction;
    finalTxn = t;
    console.log('  poll state:', t?.state, t?.txHash ? 'txHash=' + t.txHash : '');
    if (['COMPLETE', 'CONFIRMED', 'FAILED', 'DENIED', 'STUCK', 'CANCELLED'].includes(t?.state)) break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log('\n=== Final balances ===');
  const dealAfter = await rpcBal(DEAL_ADDR);
  const supplierAfter = await rpcBal(SUPPLIER_ADDR);
  const adminAfter = await rpcBal(ADMIN_ADDR);
  console.log('ADMIN   :', adminBefore, '->', adminAfter);
  console.log('DEAL    :', dealBal, '->', dealAfter);
  console.log('SUPPLIER:', supplierBefore, '->', supplierAfter);

  const supplierGain = parseFloat(supplierAfter.usdc) - parseFloat(supplierBefore.usdc);
  console.log('\nSupplier USDC gained:', supplierGain.toFixed(6));

  if (finalTxn?.state === 'COMPLETE' || finalTxn?.state === 'CONFIRMED') {
    console.log('\n✅ END-TO-END SUCCESS: deal wallet created, funded, and sent funds to supplier.');
  } else {
    console.log('\n⚠️  Transfer did not reach COMPLETE. Final state:', finalTxn?.state, finalTxn?.errorReason || '');
  }
  console.log('  Circle transferId:', transferId);
  console.log('  on-chain txHash  :', finalTxn?.txHash);
}

main().catch((e) => {
  console.error('Fatal:', e?.message || e);
  if (e?.response?.data) console.error('Circle error:', JSON.stringify(e.response.data));
  process.exit(1);
});
