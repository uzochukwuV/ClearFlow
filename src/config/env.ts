import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Cleanverse
  CLEANVERSE_API_ID: z.string(),
  CLEANVERSE_API_KEY: z.string(),
  CLEANVERSE_BASE_URL: z.string().url().default('https://uatapi.cleanverse.com/api/cooperate'),
  CLEANVERSE_ADMIN_WALLET: z.string(),

  // Circle
  CIRCLE_API_KEY: z.string(),
  CIRCLE_BASE_URL: z.string().url().default('https://api.circle.com'),
  CIRCLE_WALLET_SET_ID: z.string(),
  CIRCLE_ENTITY_SECRET: z.string(),
  CIRCLE_WEBHOOK_SECRET: z.string().optional(),
  // Platform admin wallet — a Circle developer-controlled wallet (key held by
  // Circle, controlled via the entity secret) in the wallet set. The backend
  // signs admin approvals server-side via circleClient.signMessage and sweeps
  // the 3% platform fee here. Created by scripts/setup-admin-wallet.ts.
  CIRCLE_ADMIN_WALLET_ID: z.string().optional(),

  // Base Sepolia (on-chain deposit verification for Circle deal wallets)
  MONAD_RPC_URL: z.string().url().default('https://sepolia.base.org'),
  MONAD_USDC_ADDRESS: z.string().default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),

  // Feature flags
  SKIP_CIRCLE_WALLET: z.string().default('false'),
  SKIP_APASS_VERIFICATION: z.string().default('false'),

  // JWT
  JWT_SECRET: z.string(),
  JWT_EXPIRY: z.string().default('7d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

export const isDev = config.NODE_ENV === 'development';
export const isProd = config.NODE_ENV === 'production';
