/**
 * Verify Circle sandbox credentials with a simple GET /v1/w3s/walletSets.
 * Usage: npx tsx scripts/test-circle-auth.ts
 */
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.CIRCLE_API_KEY!;
const baseUrl = (process.env.CIRCLE_BASE_URL || 'https://api-sandbox.circle.com').replace(/\/$/, '');

async function rawFetch() {
  console.log('--- Raw fetch: GET /v1/w3s/walletSets ---');
  console.log('URL:', `${baseUrl}/v1/w3s/walletSets`);
  const res = await fetch(`${baseUrl}/v1/w3s/walletSets`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json();
  console.log('status:', res.status);
  console.log('body :', JSON.stringify(body, null, 2).slice(0, 1500));
}

async function main() {
  try {
    await rawFetch();
  } catch (e: any) {
    console.error('fetch error:', e?.message);
  }
}

main();
