/**
 * Reuse the already-funded deal wallet (d28efff3) to test the Circle
 * createTransaction transfer of USDC -> SUPPLIER on Monad testnet.
 * Run after test-e2e-monad.ts has created+funded a wallet, or edit the
 * DEAL_WALLET_ID/DEAL_ADDR below to point at an existing funded wallet.
 *
 * Usage: npx tsx scripts/test-circle-transfer.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { readFileSync } from 'fs';

const RPC = 'https://rpc.ankr.com/monad_testnet';
const USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3';

// Already-funded deal wallet from the prior test-e2e-monad.ts run
const DEAL_WALLET_ID = process.env.DEAL_WALLET_ID || 'd28efff3-31ca-5091-b918-27cb6174927d';
const DEAL_ADDR = process.env.DEAL_ADDR || '0x109ff96709583ab7525dd54eb559d9dc7f41dabc';

const walletFile = JSON.parse(readFileSync('recovery/wallet.json', 'utf8'));
const SUPPLIER_ADDR = walletFile.wallets.find((w: any) => w.role === 'SUPPLIER').address;

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!.replace(/["']/g, ''),
  baseUrl: process.env.CIRCLE_BASE_URL,
});

const provider = new ethers.JsonRpcProvider(RPC);
async function bal(addr: string) {
  const mon = await provider.getBalance(addr);
  const u = await new ethers.Contract(USDC, ['function balanceOf(address) view returns (uint256)'], provider).balanceOf(addr);
  return { mon: ethers.formatEther(mon), usdc: ethers.formatUnits(u, 6) };
}

async function main() {
  console.log('Deal wallet    :', DEAL_WALLET_ID, DEAL_ADDR);
  console.log('Supplier       :', SUPPLIER_ADDR);
  console.log('Deal balance   :', await bal(DEAL_ADDR));
  console.log('Supplier before:', await bal(SUPPLIER_ADDR));

  console.log('\n=== Circle createTransaction: 2 USDC deal -> supplier ===');
  const res = await circleClient.createTransaction({
    amount: ['2'],
    walletId: DEAL_WALLET_ID,
    destinationAddress: SUPPLIER_ADDR,
    blockchain: 'MONAD-TESTNET' as any,
    fee: { type: 'level', config: { feeLevel: 'HIGH' } },
    tokenAddress: USDC,
  } as any);

  const txn = (res as any).data?.transaction ?? (res as any).data;
  const transferId = txn?.id;
  console.log('transferId:', transferId);
  console.log('state     :', txn?.state);
  console.log('txHash    :', txn?.txHash);
  if (!transferId) {
    console.error('No transferId returned. Full response:', JSON.stringify((res as any).data).slice(0, 800));
    process.exit(1);
  }

  console.log('\n=== Polling transaction status ===');
  let final = txn;
  for (let i = 0; i < 30; i++) {
    const s = await circleClient.getTransaction({ id: transferId });
    final = (s as any).data?.transaction;
    console.log('  [' + i + '] state:', final?.state, final?.txHash ? 'txHash=' + final.txHash : '', final?.errorReason ? 'err=' + final.errorReason : '');
    if (['COMPLETE', 'CONFIRMED', 'FAILED', 'DENIED', 'STUCK', 'CANCELLED'].includes(final?.state)) break;
    await new Promise((r) => setTimeout(r, 6000));
  }

  console.log('\n=== Final balances ===');
  console.log('Deal after    :', await bal(DEAL_ADDR));
  const supplierAfter = await bal(SUPPLIER_ADDR);
  console.log('Supplier after:', supplierAfter);

  const gain = parseFloat(supplierAfter.usdc);
  console.log('\nSupplier USDC balance:', gain);
  if (final?.state === 'COMPLETE' || final?.state === 'CONFIRMED') {
    console.log('✅ SUCCESS: deal wallet sent USDC to supplier via Circle.');
  } else {
    console.log('⚠️  Final state:', final?.state, final?.errorReason || '');
  }
}

main().catch((e) => {
  console.error('Fatal:', e?.message || e);
  if (e?.response?.data) console.error('Circle error:', JSON.stringify(e.response.data));
  process.exit(1);
});
