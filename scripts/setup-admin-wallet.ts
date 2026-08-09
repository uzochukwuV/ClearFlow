#!/usr/bin/env npx ts-node

/**
 * One-time setup: create the platform admin Circle developer-controlled wallet.
 *
 * The admin wallet is a Circle developer-controlled wallet in the configured
 * wallet set (CIRCLE_WALLET_SET_ID) on Monad testnet. Circle holds the key;
 * the backend controls it via the entity secret. This wallet:
 *   • signs EIP-191 admin-approval messages server-side (signMessage)
 *   • receives the 3% platform fee sweep on deal settlement
 *
 * Run once, then paste the printed wallet ID into .env as:
 *   CIRCLE_ADMIN_WALLET_ID=<id>
 *
 * Usage: npx ts-node scripts/setup-admin-wallet.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { randomUUID } from 'crypto';
import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets';

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.replace(/["']/g, '');
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  const baseUrl = process.env.CIRCLE_BASE_URL;

  if (!apiKey) throw new Error('CIRCLE_API_KEY missing in .env');
  if (!entitySecret) throw new Error('CIRCLE_ENTITY_SECRET missing in .env');
  if (!walletSetId) throw new Error('CIRCLE_WALLET_SET_ID missing in .env');

  console.log('🔐 Creating platform admin Circle wallet');
  console.log('   wallet set:', walletSetId);
  console.log('   base url:  ', baseUrl || '(default)');

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
    baseUrl,
  });

  // Monad testnet, EOA account type (matches deal wallets).
  const res = await client.createWallets({
    idempotencyKey: randomUUID(),
    blockchains: ['MONAD-TESTNET'],
    count: 1,
    walletSetId,
    accountType: 'EOA',
  } as any);

  const wallet = (res as any).data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    console.error('❌ Unexpected response — no wallet returned');
    console.error(JSON.stringify((res as any).data, null, 2));
    process.exit(1);
  }

  console.log('\n✅ Admin wallet created');
  console.log('   wallet ID :', wallet.id);
  console.log('   address   :', wallet.address);
  console.log('   blockchain:', wallet.blockchain);
  console.log('\nAdd to .env:');
  console.log(`CIRCLE_ADMIN_WALLET_ID=${wallet.id}`);
  console.log('\nOptional (address cache / legacy fallback):');
  console.log(`CLEANVERSE_ADMIN_WALLET=${wallet.address}`);

  // Sanity check: verify signMessage works (the admin must be able to sign).
  console.log('\n🧪 Verifying signMessage (EIP-191) works...');
  try {
    const testMessage = `ADMIN_SETUP_VERIFY:${Date.now()}`;
    const signRes = await client.signMessage({
      walletId: wallet.id,
      message: testMessage,
    } as any);
    const signature = (signRes as any).data?.signature;
    if (!signature) {
      console.error('❌ signMessage returned no signature:', JSON.stringify((signRes as any).data, null, 2));
      process.exit(1);
    }
    console.log('✅ signMessage works — signature length:', signature.length, 'chars');
  } catch (err: any) {
    console.error('❌ signMessage failed:', err?.response?.data || err?.message);
    process.exit(1);
  }

  console.log('\nDone. Restart the server after updating .env.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
