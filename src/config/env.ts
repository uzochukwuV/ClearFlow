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
  CIRCLE_WEBHOOK_SECRET: z.string(),

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
