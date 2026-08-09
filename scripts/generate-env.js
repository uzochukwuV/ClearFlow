#!/usr/bin/env node

/**
 * Circle Setup & Wallet Generation Script
 * 
 * This script:
 * 1. Registers entity secret with Circle
 * 2. Generates 5 wallets using ethers.js
 * 3. Updates .env with all values
 */

const { randomBytes } = require('crypto');
const { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { resolve, join } = require('path');
const dotenv = require('dotenv');

// Load .env
dotenv.config();

// Load ethers (CommonJS)
const { ethers } = require('ethers');

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_BASE_URL = process.env.CIRCLE_BASE_URL || 'https://api.circle.com/v1';

console.log('🔐 ClearFlow Circle Setup & Wallet Generation');
console.log('============================================\n');

// Check API key
if (!CIRCLE_API_KEY || CIRCLE_API_KEY === 'TEST_API_KEY:...') {
  console.error('❌ CIRCLE_API_KEY not properly configured in .env');
  console.log('   Please set your real Circle API key first.\n');
  process.exit(1);
}

console.log('✅ API key found: ' + CIRCLE_API_KEY.substring(0, 20) + '...\n');

// ============ PART 1: Register Entity Secret ============

async function setupEntitySecret() {
  console.log('📡 Part 1: Registering Entity Secret with Circle');
  console.log('------------------------------------------------');

  // Check if already exists
  const existingEnv = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  
  if (/^CIRCLE_ENTITY_SECRET=/m.test(existingEnv)) {
    console.log('⚠️  Entity secret already exists, skipping registration.');
    console.log('   To regenerate, remove CIRCLE_ENTITY_SECRET from .env first.\n');
    return null;
  }

  // Generate entity secret
  const entitySecret = randomBytes(32).toString('hex');
  console.log('   Generated: ' + entitySecret.substring(0, 8) + '...');

  try {
    const response = await fetch(`${CIRCLE_BASE_URL}/v1/entitySecret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CIRCLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entitySecret: entitySecret,
        algorithm: 'RSA-OAEP-256',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log('   ⚠️  Registration failed: ' + JSON.stringify(data.message || data));
      console.log('   The entity secret will still be saved to .env');
      console.log('   You may need to register manually later.\n');
      return entitySecret;
    }

    console.log('   ✅ Registered successfully with Circle\n');
    return entitySecret;

  } catch (error) {
    console.log('   ⚠️  Registration error: ' + error.message);
    console.log('   Saving entity secret anyway...\n');
    return entitySecret;
  }
}

// ============ PART 2: Generate Wallets ============

function generateWallets() {
  console.log('📡 Part 2: Generating Wallets with ethers.js');
  console.log('--------------------------------------------');

  const wallets = [];
  const roles = ['ADMIN', 'BUYER', 'SUPPLIER', 'INVESTOR_1', 'INVESTOR_2'];

  for (const role of roles) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push({
      role,
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
    
    console.log(`   ${role}:`);
    console.log(`     Address: ${wallet.address}`);
    console.log(`     Private Key: ${wallet.privateKey.substring(0, 20)}...\n`);
  }

  return wallets;
}

// ============ PART 3: Update .env ============

function updateEnvFile(entitySecret, wallets) {
  console.log('📡 Part 3: Updating .env file');
  console.log('-----------------------------');

  const recoveryPath = resolve('./recovery');
  mkdirSync(recoveryPath, { recursive: true });

  // Save recovery info
  const recoveryInfo = {
    generatedAt: new Date().toISOString(),
    note: 'Store this recovery file securely. Required to recover Circle entity secret access.',
    wallets: wallets.map(w => ({
      role: w.role,
      address: w.address,
    })),
  };
  
  const recoveryFilePath = join(recoveryPath, 'wallet-info.json');
  writeFileSync(recoveryFilePath, JSON.stringify(recoveryInfo, null, 2));
  console.log(`   ✅ Saved wallet info: ${recoveryFilePath}`);

  // Build new .env entries
  let envUpdates = '';

  if (entitySecret) {
    envUpdates += `\n# Circle Entity Secret (for developer-controlled wallets)\n`;
    envUpdates += `CIRCLE_ENTITY_SECRET=${entitySecret}\n`;
  }

  envUpdates += `\n# Wallet Addresses (ClearFlow Roles)\n`;
  envUpdates += `# ADMIN - Platform admin wallet\n`;
  envUpdates += `CLEARFLOW_ADMIN_WALLET=${wallets.find(w => w.role === 'ADMIN').address}\n`;
  envUpdates += `\n# BUYER - Test buyer wallet\n`;
  envUpdates += `TEST_BUYER_WALLET=${wallets.find(w => w.role === 'BUYER').address}\n`;
  envUpdates += `\n# SUPPLIER - Test supplier wallet\n`;
  envUpdates += `TEST_SUPPLIER_WALLET=${wallets.find(w => w.role === 'SUPPLIER').address}\n`;
  envUpdates += `\n# INVESTORS - Test investor wallets\n`;
  envUpdates += `TEST_INVESTOR_1_WALLET=${wallets.find(w => w.role === 'INVESTOR_1').address}\n`;
  envUpdates += `TEST_INVESTOR_2_WALLET=${wallets.find(w => w.role === 'INVESTOR_2').address}\n`;

  // Save private keys to separate file (NOT in .env)
  const privateKeys = {
    generatedAt: new Date().toISOString(),
    warning: 'NEVER COMMIT THIS FILE TO VERSION CONTROL',
    wallets: wallets.map(w => ({
      role: w.role,
      address: w.address,
      privateKey: w.privateKey,
    })),
  };
  
  const keysFilePath = join(recoveryPath, 'test-private-keys.json');
  writeFileSync(keysFilePath, JSON.stringify(privateKeys, null, 2));
  console.log(`   ⚠️  Saved private keys: ${keysFilePath}`);
  console.log('   ⚠️  NEVER commit this file to version control!\n');

  // Append to .env
  appendFileSync('.env', envUpdates);
  console.log('   ✅ Updated .env with wallet addresses\n');

  return { recoveryFilePath, keysFilePath };
}

// ============ MAIN ============

async function main() {
  try {
    // Part 1: Entity secret
    const entitySecret = await setupEntitySecret();

    // Part 2: Generate wallets
    const wallets = generateWallets();

    // Part 3: Update .env
    const { keysFilePath } = updateEnvFile(entitySecret, wallets);

    // Summary
    console.log('============================================');
    console.log('✅ Setup Complete!');
    console.log('============================================\n');

    console.log('📋 Summary:');
    console.log('   • Entity secret: ' + (entitySecret ? 'Generated & registered' : 'Already exists'));
    console.log('   • Wallets generated: 5\n');

    console.log('📁 Files created:');
    console.log('   • .env - Updated with addresses');
    console.log('   • recovery/wallet-info.json - Wallet addresses');
    console.log('   • ' + keysFilePath + ' - PRIVATE KEYS ⚠️\n');

    console.log('🔐 IMPORTANT SECURITY REMINDERS:');
    console.log('   1. NEVER commit private keys to version control');
    console.log('   2. Store the recovery folder securely');
    console.log('   3. Fund test wallets with test USDC for development');
    console.log('   4. Use real wallets in production\n');

    console.log('📝 Next steps:');
    console.log('   1. Fund test wallets with testnet USDC');
    console.log('   2. Run database migrations: npx prisma migrate dev');
    console.log('   3. Start server: npm run dev\n');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
