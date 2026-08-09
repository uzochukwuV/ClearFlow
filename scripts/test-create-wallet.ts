/**
 * Standalone test: create a real Circle developer-controlled wallet
 * in the existing wallet set (CIRCLE_WALLET_SET_ID).
 *
 * Usage: npx ts-node scripts/test-create-wallet.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  initiateDeveloperControlledWalletsClient,
} from '@circle-fin/developer-controlled-wallets';
import { randomUUID } from 'crypto';

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET?.replace(/["']/g, '');
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  const baseUrl = process.env.CIRCLE_BASE_URL;

  if (!apiKey) throw new Error('CIRCLE_API_KEY missing');
  if (!entitySecret) throw new Error('CIRCLE_ENTITY_SECRET missing');
  if (!walletSetId) throw new Error('CIRCLE_WALLET_SET_ID missing');

  console.log('API key:', apiKey.slice(0, 14) + '...');
  console.log('Entity secret length:', entitySecret.length, 'chars');
  console.log('Wallet set ID:', walletSetId);
  console.log('Base URL:', baseUrl);

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
    baseUrl,
  });

  console.log('\nCreating wallet (MATIC-AMOY, accountType EOA) in existing wallet set...');
  try {
    const res = await client.createWallets({
      idempotencyKey: randomUUID(),
      blockchains: ['MATIC-AMOY'],
      count: 1,
      walletSetId,
      accountType: 'EOA',
      metadata: [{ refId: 'test-' + Date.now() }],
    } as any);

    const data = (res as any).data?.data ?? (res as any).data ?? res;
    console.log('\n✅ Create wallet response:');
    console.log(JSON.stringify(data, null, 2));

    const wallet = data?.wallets?.[0];
    if (wallet) {
      console.log('\n--- Result ---');
      console.log('walletId  :', wallet.id);
      console.log('address   :', wallet.address);
      console.log('blockchain:', wallet.blockchain);
      console.log('state     :', wallet.state);

      console.log('\nFetching token balances for the new wallet...');
      try {
        const bal = await client.getWalletTokenBalance({ id: wallet.id });
        console.log(JSON.stringify((bal as any).data?.data ?? (bal as any).data, null, 2));
      } catch (e: any) {
        console.log('(balance fetch skipped:', e?.message, ')');
      }
    }
  } catch (err: any) {
    console.error('\n❌ Create wallet failed:');
    console.error('status :', err?.response?.status || err?.code);
    console.error('message:', err?.message);
    if (err?.response?.data) {
      console.error('body   :', JSON.stringify(err.response.data, null, 2));
    } else if (err?.data) {
      console.error('body   :', JSON.stringify(err.data, null, 2));
    }
    process.exit(1);
  }
}

main();
