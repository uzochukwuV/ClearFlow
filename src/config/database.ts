import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    const err = error as Error;
    console.error('⚠️  Database connection failed:', err.message);
    console.log('   Server will run without database functionality');
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('🔌 Database disconnected');
  } catch (error) {
    const err = error as Error;
    console.error('⚠️  Database disconnect error:', err.message);
  }
}
