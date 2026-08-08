/**
 * Script to generate A-Pass records for test wallets using Cleanverse API
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// Import the services
const { getAPassService } = await import('../dist/services/cleanverse/index.js');

const prisma = new PrismaClient();
const aPassService = getAPassService();

// Default expiration: 2029-01-21 00:00:00 UTC
const DEFAULT_EXPIRATION = 1863690034;

const testWallets = [
  {
    role: 'BUYER',
    address: '0x773d75233d589cf756482dc8e6ee7091eab4ed4a',
    userType: 'BUYER',
    customerId: 'CLEARFLOW01BUYER000001',
    chain: 'monad',  // Use monad chain like other test records
    identity: {
      fullName: 'Acme Corporation',
      idType: 'ID_CARD',
      issuingCountry: 'US',
    },
  },
  {
    role: 'SUPPLIER',
    address: '0xa89ff530f9b412759ed59a71d4f9a5be17801f20',
    userType: 'SUPPLIER',
    customerId: 'CLEARFLOW01SUPPLIER0001',
    chain: 'monad',
    identity: {
      fullName: 'Global Manufacturing Ltd',
      idType: 'ID_CARD',
      issuingCountry: 'CN',
    },
  },
  {
    role: 'INVESTOR_1',
    address: '0x316b492813310cca41a94afe30d0fa71a31d11ab',
    userType: 'INVESTOR',
    customerId: 'CLEARFLOW01INVESTOR00001',
    chain: 'monad',
    identity: {
      fullName: 'Venture Capital Partners',
      idType: 'ID_CARD',
      issuingCountry: 'US',
    },
  },
];

async function generateAPassForWallet(wallet) {
  console.log(`\n📝 Generating A-Pass for ${wallet.role}...`);
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Customer ID: ${wallet.customerId}`);

  try {
    const response = await aPassService.generateAPass({
      chain: wallet.chain,
      walletAddress: wallet.address,
      customerId: wallet.customerId,
      expirationTime: DEFAULT_EXPIRATION,
      identityDataList: [
        {
          idType: wallet.identity.idType,
          fullName: wallet.identity.fullName,
          issuingCountryISO2: wallet.identity.issuingCountry,
        },
      ],
    });

    console.log('   API Response:', JSON.stringify(response, null, 2));

    if (response.code !== '0000') {
      console.log(`   ❌ Failed: ${response.message}`);
      return;
    }

    const data = response.data;
    console.log(`   ✅ A-Pass Generated!`);
    console.log(`      A-Pass ID: ${data.cvRecordId || data.apassId}`);
    console.log(`      Tier: ${data.tier}`);
    console.log(`      Countries: ${data.countries?.join(', ')}`);
    console.log(`      Status: ${data.wallet ? 'Wallet registered' : 'Pending'}`);

    // Update database with A-Pass info
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress: wallet.address.toLowerCase() },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          apassId: data.cvRecordId || data.apassId,
          apassStatus: 'ACTIVE',
          apassTier: data.tier ? parseInt(data.tier) : 50,
          apassCountries: data.countries || [wallet.identity.issuingCountry],
        },
      });
      console.log(`   📝 Updated database with A-Pass info`);
    } else {
      // Create user with A-Pass info
      await prisma.user.create({
        data: {
          walletAddress: wallet.address.toLowerCase(),
          userType: wallet.userType,
          apassId: data.cvRecordId || data.apassId,
          apassStatus: 'ACTIVE',
          apassTier: data.tier ? parseInt(data.tier) : 50,
          apassCountries: data.countries || [wallet.identity.issuingCountry],
        },
      });
      console.log(`   📝 Created user with A-Pass info`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(error.stack);
  }
}

async function main() {
  console.log('============================================');
  console.log('  GENERATING A-PASS FOR TEST WALLETS');
  console.log('============================================');

  // First, delete any existing data for these wallets
  console.log('\n🧹 Cleaning up existing data...');
  try {
    // Delete purchase orders first
    await prisma.pOSignature.deleteMany({});
    await prisma.purchaseOrder.deleteMany({});
    
    // Delete users
    await prisma.user.deleteMany({
      where: {
        walletAddress: {
          in: testWallets.map(w => w.address.toLowerCase()),
        },
      },
    });
    console.log('   Done.');
  } catch (error) {
    console.log('   Cleanup error (may be empty):', error.message);
  }

  for (const wallet of testWallets) {
    await generateAPassForWallet(wallet);
  }

  console.log('\n============================================');
  console.log('  A-PASS GENERATION COMPLETE');
  console.log('============================================\n');

  // List all users
  const users = await prisma.user.findMany();
  console.log('Registered Users:');
  for (const user of users) {
    console.log(`  - ${user.userType}: ${user.walletAddress}`);
    console.log(`    A-Pass ID: ${user.apassId || 'N/A'}`);
    console.log(`    Status: ${user.apassStatus}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
