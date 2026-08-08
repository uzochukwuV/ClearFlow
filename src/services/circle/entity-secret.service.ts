import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { logger } from '../../config';

/**
 * Entity Secret Service
 * 
 * Generates and manages the Circle Entity Secret for developer-controlled wallets.
 * 
 * IMPORTANT SECURITY NOTES:
 * - The entity secret is used to sign transactions for developer-controlled wallets
 * - It should NEVER be exposed in browser or client-side code
 * - Store securely in environment variables or a secrets manager
 * - Circle provides a recovery file during registration - store this securely
 * 
 * Docs: https://developers.circle.com/wallets/dev-controlled/register-entity-secret
 */
export class EntitySecretService {
  private baseUrl: string;
  private apiKey: string;
  private entitySecret: string;
  private recoveryFilePath: string;

  constructor() {
    this.baseUrl = process.env.CIRCLE_BASE_URL || 'https://api.circle.com/v1';
    this.apiKey = process.env.CIRCLE_API_KEY || '';
    this.entitySecret = process.env.CIRCLE_ENTITY_SECRET || '';
    this.recoveryFilePath = process.env.CIRCLE_RECOVERY_PATH || './recovery';
  }

  /**
   * Check if entity secret is configured
   */
  isConfigured(): boolean {
    return !!this.entitySecret;
  }

  /**
   * Get the entity secret (should be in env var)
   */
  getEntitySecret(): string {
    if (!this.entitySecret) {
      throw new Error('CIRCLE_ENTITY_SECRET is not configured');
    }
    return this.entitySecret;
  }

  /**
   * Generate a new 32-byte entity secret
   */
  generateEntitySecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Register entity secret with Circle API
   * 
   * This sends the entity secret to Circle, which returns a ciphertext
   * that Circle uses to encrypt sensitive operations.
   */
  async registerEntitySecret(params: {
    entitySecret: string;
    recoveryFilePath: string;
  }): Promise<{
    success: boolean;
    ciphertext?: string;
    error?: string;
  }> {
    const { entitySecret, recoveryFilePath } = params;

    logger.info('Registering entity secret with Circle');

    try {
      // Ensure recovery directory exists
      mkdirSync(recoveryFilePath, { recursive: true });

      // Circle's API endpoint for registering entity secret
      const response = await fetch(`${this.baseUrl}/v1/entitySecret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entitySecret: entitySecret,
          algorithm: 'RSA-OAEP-256',
        }),
      });

      const data = await response.json() as { data?: { ciphertext?: string }; message?: string };

      if (!response.ok) {
        logger.error({ status: response.status, error: data }, 'Failed to register entity secret');
        return {
          success: false,
          error: `Failed to register: ${JSON.stringify(data)}`,
        };
      }

      logger.info('Entity secret registered successfully');

      return {
        success: true,
        ciphertext: data.data?.ciphertext,
      };
    } catch (error) {
      logger.error({ error }, 'Entity secret registration failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Setup entity secret (generate + register + save)
   * 
   * This is a convenience method that:
   * 1. Generates a new entity secret
   * 2. Registers it with Circle
   * 3. Saves the recovery file
   * 4. Optionally saves to .env
   */
  async setupEntitySecret(options?: {
    saveToEnv?: boolean;
    envFilePath?: string;
    recoveryFilePath?: string;
  }): Promise<{
    success: boolean;
    entitySecret?: string;
    ciphertext?: string;
    recoveryFile?: string;
    error?: string;
  }> {
    const {
      saveToEnv = true,
      envFilePath = '.env',
      recoveryFilePath = this.recoveryFilePath,
    } = options || {};

    logger.info('Setting up Circle entity secret');

    // Check if already configured
    if (this.isConfigured()) {
      logger.warn('Entity secret already configured - skipping setup');
      return {
        success: true,
        entitySecret: '*** (already configured) ***',
      };
    }

    try {
      // 1. Generate new entity secret
      const entitySecret = this.generateEntitySecret();
      logger.info('Generated new entity secret');

      // 2. Ensure recovery directory exists
      mkdirSync(recoveryFilePath, { recursive: true });

      // 3. Register with Circle
      const registerResult = await this.registerEntitySecret({
        entitySecret,
        recoveryFilePath,
      });

      if (!registerResult.success) {
        return {
          success: false,
          error: registerResult.error,
        };
      }

      // 4. Save recovery file path info
      const recoveryInfo = {
        createdAt: new Date().toISOString(),
        recoveryFilePath,
        algorithm: 'RSA-OAEP-256',
        note: 'Store this recovery file securely. Required to recover entity secret.',
      };

      const recoveryInfoPath = `${recoveryFilePath}/entity-secret-info.json`;
      writeFileSync(recoveryInfoPath, JSON.stringify(recoveryInfo, null, 2));

      // 5. Optionally save to .env
      if (saveToEnv) {
        const envLine = `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`;
        
        if (existsSync(envFilePath)) {
          const currentEnv = readFileSync(envFilePath, 'utf8');
          
          // Check if already exists
          if (/^CIRCLE_ENTITY_SECRET=/m.test(currentEnv)) {
            logger.warn('CIRCLE_ENTITY_SECRET already in .env - not overwriting');
          } else {
            appendFileSync(envFilePath, envLine);
            logger.info('Saved entity secret to .env');
          }
        } else {
          writeFileSync(envFilePath, `CIRCLE_ENTITY_SECRET=${entitySecret}\n`);
          logger.info('Created .env with entity secret');
        }
      }

      return {
        success: true,
        entitySecret,
        ciphertext: registerResult.ciphertext,
        recoveryFile: recoveryInfoPath,
      };
    } catch (error) {
      logger.error({ error }, 'Entity secret setup failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Setup failed',
      };
    }
  }

  /**
   * Get entity secret ciphertext for API requests
   * 
   * The ciphertext is used in developer-controlled wallet operations.
   */
  async getEntitySecretCiphertext(): Promise<{
    success: boolean;
    ciphertext?: string;
    error?: string;
  }> {
    if (!this.entitySecret) {
      return {
        success: false,
        error: 'Entity secret not configured',
      };
    }

    try {
      // Use Circle's register endpoint if we don't have a cached ciphertext
      // In production, you'd cache this or use the recovery file
      // Note: Developer-controlled wallets require a production API key
      // Sandbox API may not support this feature
      const response = await fetch(`${this.baseUrl}/v1/entitySecret/ciphertext`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entitySecret: this.entitySecret,
        }),
      });

      const data = await response.json() as { data?: { ciphertext?: string }; message?: string };

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to get ciphertext: ${JSON.stringify(data)}`,
        };
      }

      return {
        success: true,
        ciphertext: data.data?.ciphertext,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get ciphertext',
      };
    }
  }

  /**
   * Validate that entity secret is correctly configured
   */
  async validateConfiguration(): Promise<{
    valid: boolean;
    message: string;
  }> {
    if (!this.apiKey) {
      return { valid: false, message: 'CIRCLE_API_KEY not configured' };
    }

    if (!this.entitySecret) {
      return { valid: false, message: 'CIRCLE_ENTITY_SECRET not configured' };
    }

    // Try to get ciphertext to validate the secret works
    const result = await this.getEntitySecretCiphertext();
    
    if (!result.success) {
      return { 
        valid: false, 
        message: `Entity secret validation failed: ${result.error}` 
      };
    }

    return { valid: true, message: 'Entity secret configured correctly' };
  }
}

// Singleton instance
let entitySecretInstance: EntitySecretService | null = null;

export function getEntitySecretService(): EntitySecretService {
  if (!entitySecretInstance) {
    entitySecretInstance = new EntitySecretService();
  }
  return entitySecretInstance;
}

export default getEntitySecretService;
