import { recoverSigner } from '../../utils/crypto';
import { logger } from '../../config';
import { config } from '../../config';

export interface AuthResult {
  valid: boolean;
  walletAddress?: string;
  error?: string;
}

export interface AdminAuthResult extends AuthResult {
  isAdmin: boolean;
}

/**
 * Authentication Service
 * 
 * Verifies EIP-191 signatures to authenticate wallet-based requests.
 * Never trusts wallet addresses submitted in request bodies.
 */
export class AuthService {
  /**
   * Verify a signature and recover the signer's wallet address
   */
  verifySignature(signature: string, message: string): AuthResult {
    if (!signature || !message) {
      return { valid: false, error: 'Signature and message are required' };
    }

    try {
      const walletAddress = recoverSigner(message, signature);
      
      if (!walletAddress) {
        logger.warn({ message }, 'Failed to recover signer from signature');
        return { valid: false, error: 'Invalid signature - could not recover signer' };
      }

      logger.debug({ walletAddress, messagePrefix: message.substring(0, 50) }, 'Signature verified');
      
      return { valid: true, walletAddress };
    } catch (error) {
      logger.error({ error }, 'Signature verification failed');
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Signature verification failed' 
      };
    }
  }

  /**
   * Verify signature and optionally check if it matches an expected address
   */
  verifySignatureForAddress(
    signature: string,
    message: string,
    expectedAddress?: string
  ): AuthResult {
    const result = this.verifySignature(signature, message);
    
    if (!result.valid) {
      return result;
    }

    // Check if signer matches expected address (if provided)
    if (expectedAddress && result.walletAddress) {
      if (result.walletAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
        logger.warn({ 
          signer: result.walletAddress, 
          expected: expectedAddress 
        }, 'Signer does not match expected address');
        
        return { 
          valid: false, 
          walletAddress: result.walletAddress,
          error: 'Signature does not match expected address' 
        };
      }
    }

    return result;
  }

  /**
   * Verify admin signature
   * Checks if the signer is the configured admin wallet
   */
  verifyAdminSignature(signature: string, message: string): AdminAuthResult {
    const result = this.verifySignature(signature, message);
    
    if (!result.valid) {
      return { ...result, isAdmin: false };
    }

    const adminWallet = config.CLEANVERSE_ADMIN_WALLET?.toLowerCase();
    const signer = result.walletAddress?.toLowerCase();

    if (!adminWallet || signer !== adminWallet) {
      logger.warn({ 
        signer, 
        adminWallet 
      }, 'Non-admin wallet attempted admin action');
      
      return { 
        ...result, 
        isAdmin: false,
        error: 'Not authorized - admin wallet required' 
      };
    }

    logger.info({ walletAddress: result.walletAddress }, 'Admin action authorized');
    return { ...result, isAdmin: true };
  }

  /**
   * Parse message to extract action type and parameters
   * Format: ACTION_TYPE:param1:value1,param2:value2:timestamp
   */
  parseAuthMessage(message: string): {
    actionType: string;
    params: Record<string, string>;
    timestamp: number;
  } | null {
    try {
      const parts = message.split(':');
      if (parts.length < 3) {
        return null;
      }

      const actionType = parts[0];
      const timestamp = parseInt(parts[parts.length - 1], 10);
      
      // Params are between action type and timestamp
      const paramString = parts.slice(1, -1).join(':');
      const params: Record<string, string> = {};
      
      if (paramString) {
        paramString.split(',').forEach(param => {
          const [key, value] = param.split(':');
          if (key && value) {
            params[key] = value;
          }
        });
      }

      // Check timestamp is recent (within 5 minutes)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      if (timestamp < fiveMinutesAgo) {
        logger.warn({ timestamp, now: Date.now() }, 'Auth message timestamp expired');
        return null;
      }

      return { actionType, params, timestamp };
    } catch (error) {
      logger.error({ error, message }, 'Failed to parse auth message');
      return null;
    }
  }

  /**
   * Generate authentication message for onboarding
   */
  generateOnboardMessage(customerId: string, chain: string): string {
    const timestamp = Date.now();
    return `ONBOARD:customerId:${customerId},chain:${chain}:${timestamp}`;
  }

  /**
   * Generate authentication message for signing a PO
   */
  generateSignPOMessage(poId: string, signerType: 'BUYER' | 'SUPPLIER'): string {
    const timestamp = Date.now();
    return `SIGN_PO:poId:${poId},signerType:${signerType}:${timestamp}`;
  }

  /**
   * Generate authentication message for contribution
   */
  generateContributeMessage(dealId: string, amount: string): string {
    const timestamp = Date.now();
    return `CONTRIBUTE:amount:${amount},dealId:${dealId}:${timestamp}`;
  }

  /**
   * Generate authentication message for status check
   */
  generateStatusMessage(walletAddress: string): string {
    const timestamp = Date.now();
    return `STATUS:wallet:${walletAddress}:${timestamp}`;
  }

  /**
   * Generate authentication message for eligibility check
   */
  generateEligibilityMessage(walletAddress: string, dealId: string): string {
    const timestamp = Date.now();
    return `ELIGIBILITY:dealId:${dealId},wallet:${walletAddress}:${timestamp}`;
  }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

export default getAuthService;
