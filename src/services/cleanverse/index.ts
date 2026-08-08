/**
 * Cleanverse API Service
 * 
 * Complete integration with Cleanverse Cooperate API v5.6
 * 
 * Modules:
 * - A-Pass: Identity/KYC management
 * - A-Token: Compliance token issuance
 * - Validator: Compliance pool verification
 * - Ramp: Fiat on/off-ramp
 * - Audit: Transaction queries and reporting
 */

// Re-export types
export * from './types';

// Base client
export { CleanverseClient, getCleanverseClient } from './client';

// Service modules
export { AService, getAPassService } from './apass.service';
export { ATokenService, getATokenService } from './atoken.service';
export { RampService, getRampService } from './ramp.service';
export { AuditService, getAuditService } from './audit.service';
export { ValidatorService, getValidatorService } from './validator.service';

// Convenience imports
import { getAPassService } from './apass.service';
import { getATokenService } from './atoken.service';
import { getRampService } from './ramp.service';
import { getAuditService } from './audit.service';
import { getValidatorService } from './validator.service';

/**
 * Cleanverse Service Factory
 * Provides all Cleanverse API functionality
 */
export class CleanverseService {
  // A-Pass (Identity/KYC)
  get aPass() {
    return getAPassService();
  }

  // A-Token (Compliance Tokens)
  get aToken() {
    return getATokenService();
  }

  // Fiat Ramp
  get ramp() {
    return getRampService();
  }

  // Audit & Queries
  get audit() {
    return getAuditService();
  }

  // Validator Compliance
  get validator() {
    return getValidatorService();
  }
}

// Singleton instance
let cleanverseServiceInstance: CleanverseService | null = null;

export function getCleanverseService(): CleanverseService {
  if (!cleanverseServiceInstance) {
    cleanverseServiceInstance = new CleanverseService();
  }
  return cleanverseServiceInstance;
}

export default getCleanverseService;
