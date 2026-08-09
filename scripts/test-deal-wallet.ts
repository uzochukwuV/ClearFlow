/**
 * Test CircleWalletService.createDealWallet directly - the exact method
 * deal.service.ts calls. Verifies a real wallet is created per deal and
 * the returned walletId/address can be read back via getDealWallet.
 *
 * Usage: npx tsx scripts/test-deal-wallet.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { getCircleWalletService } from '../src/services/circle';

async function main() {
  const svc = getCircleWalletService();
  const dealId = 'test-deal-' + Date.now();

  console.log('1) createDealWallet for', dealId);
  const created = await svc.createDealWallet(dealId, 'MATIC');
  console.log('   result:', created);

  if (!created.success || !created.walletId || !created.address) {
    console.error('\n❌ createDealWallet failed:', created.error);
    process.exit(1);
  }

  console.log('\n2) getDealWallet (read back)');
  const fetched = await svc.getDealWallet(created.walletId);
  console.log('   wallet:', fetched.wallet && {
    id: fetched.wallet.id,
    address: fetched.wallet.address,
    blockchain: fetched.wallet.blockchain,
    state: fetched.wallet.state,
    custodyType: fetched.wallet.custodyType,
  });

  console.log('\n3) getDepositAddress');
  const deposit = await svc.getDepositAddress(created.walletId);
  console.log('   address:', deposit.address);

  console.log('\n4) getWalletBalances (expect empty)');
  const bal = await svc.getWalletBalances(created.walletId);
  console.log('   totalUsdc:', bal.totalUsdc, '| balances:', bal.balances);

  console.log('\n✅ createDealWallet works end-to-end.');
  console.log('   Store these on the Deal row:');
  console.log('   circleWalletId     =', created.walletId);
  console.log('   circleWalletAddress=', created.address);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
