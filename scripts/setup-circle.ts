#!/usr/bin/env npx ts-node

/**
 * Circle Entity Secret Setup Script
 * 
 * Run this once to set up the Circle entity secret for developer-controlled wallets.
 * 
 * Usage:
 *   npx ts-node scripts/setup-circle.ts
 * 
 * This script will:
 * 1. Generate a new 32-byte entity secret
 * 2. Register it with Circle API
 * 3. Save the recovery file to ./recovery/
 * 4. Add CIRCLE_ENTITY_SECRET to .env
 */

import { randomBytes } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import dotenv from 'dotenv';

// Load existing .env
dotenv.config();

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_BASE_URL = process.env.CIRCLE_BASE_URL || 'https://api.circle.com/v1';

async function main() {
  console.log('🔐 Circle Entity Secret Setup');
  console.log('==============================\n');

  // Check API key
  if (!CIRCLE_API_KEY) {
    console.error('❌ CIRCLE_API_KEY not found in .env');
    console.log('\nPlease add your Circle API key to .env:');
    console.log('CIRCLE_API_KEY=your_api_key_here\n');
    process.exit(1);
  }

  console.log('✅ API key found');

  // Check if entity secret already exists
  const existingEnv = existsSync('.env') 
    ? readFileSync('.env', 'utf8') 
    : '';

  if (/^CIRCLE_ENTITY_SECRET=/m.test(existingEnv)) {
    console.log('⚠️  CIRCLE_ENTITY_SECRET already exists in .env');
    console.log('   Refusing to overwrite. If you need to regenerate:');
    console.log('   1. Delete CIRCLE_ENTITY_SECRET from .env');
    console.log('   2. Run this script again\n');
    
    const answer = await prompt('Generate new entity secret anyway? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Setup cancelled.\n');
      process.exit(0);
    }
  }

  // Generate entity secret
  console.log('\n📝 Generating entity secret...');
  const entitySecret = randomBytes(32).toString('hex');
  console.log(`   Generated: ${entitySecret.substring(0, 8)}...${entitySecret.substring(56)}`);

  // Create recovery directory
  const recoveryPath = resolve('./recovery');
  mkdirSync(recoveryPath, { recursive: true });
  console.log(`   Recovery path: ${recoveryPath}`);

  // Register entity secret with Circle
  console.log('\n📡 Registering with Circle API...');
  
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

    const data = await response.json() as { data?: { ciphertext?: string; recoveryFile?: string }; message?: string };

    if (!response.ok) {
      console.error('❌ Failed to register entity secret');
      console.error(`   Error: ${JSON.stringify(data)}`);
      process.exit(1);
    }

    console.log('✅ Entity secret registered with Circle');

    // Save recovery file if provided
    if (data.data?.recoveryFile) {
      const recoveryFileContent = data.data.recoveryFile;
      const recoveryFilePath = join(recoveryPath, 'entity-secret-recovery.json');
      
      // Circle may provide the recovery file content directly
      if (typeof recoveryFileContent === 'string') {
        writeFileSync(recoveryFilePath, recoveryFileContent);
        console.log(`   Recovery file saved: ${recoveryFilePath}`);
      }
    }

    // Save entity secret to .env
    console.log('\n💾 Saving to .env...');
    
    const envLine = `\n# Circle Entity Secret (for developer-controlled wallets)\n# Generated: ${new Date().toISOString()}\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`;
    
    if (existsSync('.env')) {
      appendFileSync('.env', envLine);
    } else {
      writeFileSync('.env', `CIRCLE_API_KEY=${CIRCLE_API_KEY}\n${envLine}`);
    }
    
    console.log('   Added to .env');

    // Save info file
    const infoFilePath = join(recoveryPath, 'setup-info.json');
    const setupInfo = {
      createdAt: new Date().toISOString(),
      algorithm: 'RSA-OAEP-256',
      note: 'Store the recovery file securely. Required to recover entity secret access.',
      recoveryPath: recoveryPath,
      entitySecretLength: entitySecret.length,
    };
    writeFileSync(infoFilePath, JSON.stringify(setupInfo, null, 2));
    console.log(`   Info saved: ${infoFilePath}`);

    console.log('\n✅ Setup complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Store the recovery file securely (cloud storage, HSM, etc.)');
    console.log('   2. Never commit .env to version control');
    console.log('   3. Test wallet creation with: npx ts-node scripts/test-wallet.ts');
    console.log('');

  } catch (error) {
    console.error('❌ Registration failed:', error);
    process.exit(1);
  }
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

main();
