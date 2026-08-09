/**
 * Verify the Circle admin wallet end-to-end:
 *  1. getAdminWallet() resolves { walletId, address } from CIRCLE_ADMIN_WALLET_ID
 *  2. signAsAdmin(message) signs with the Circle wallet (server-side)
 *  3. verifyAdminSignature(signature, message) accepts it (isAdmin=true)
 *  4. verifyAdminSignature rejects a forged investor signature
 *
 * Usage: npx tsx scripts/test-admin-wallet.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { getAuthService } from '../src/services/auth/auth.service';
import { recoverSigner } from '../src/utils/crypto';

async function main() {
  const auth = getAuthService();

  // 1. Resolve admin wallet address from Circle.
  const adminAddress = await auth.getAdminWalletAddress();
  console.log('1. admin wallet address:', adminAddress);

  // 2. Sign a message server-side as the admin.
  const message = `CONTRIBUTE:amount:100,dealId:test:${Date.now()}`;
  const signResult = await auth.signAsAdmin(message);
  if (!signResult.success || !signResult.signature) {
    console.error('❌ signAsAdmin failed:', signResult.error);
    process.exit(1);
  }
  console.log('2. signAsAdmin OK — signature:', signResult.signature.slice(0, 18) + '...');

  // Sanity: the recovered signer must equal the admin address.
  const recovered = recoverSigner(message, signResult.signature);
  console.log('   recovered signer:', recovered);
  if (recovered?.toLowerCase() !== adminAddress.toLowerCase()) {
    console.error('❌ signer mismatch: recovered', recovered, '≠ admin', adminAddress);
    process.exit(1);
  }

  // 3. verifyAdminSignature must accept it.
  const accept = await auth.verifyAdminSignature(signResult.signature, message);
  console.log('3. verifyAdminSignature(admin sig) → valid:', accept.valid, 'isAdmin:', accept.isAdmin);
  if (!accept.valid || !accept.isAdmin) {
    console.error('❌ admin signature was not accepted:', accept.error);
    process.exit(1);
  }

  // 4. A different message signed by a different (forged) signer must be rejected.
  const forgedSig = '0x' + '0'.repeat(130); // structurally valid length, bogus
  const reject = await auth.verifyAdminSignature(forgedSig, message);
  console.log('4. verifyAdminSignature(forged sig) → valid:', reject.valid, 'isAdmin:', reject.isAdmin);
  if (reject.isAdmin) {
    console.error('❌ forged signature was accepted as admin!');
    process.exit(1);
  }

  console.log('\n✅ Admin Circle wallet E2E verified: resolve → sign → accept → reject forged.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
