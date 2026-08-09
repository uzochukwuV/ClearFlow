/**
 * Funding Service
 * 
 * Manages deal funding state machine and contribution attribution.
 * 
 * Key features:
 * - Funding state machine (PENDING → OPEN → FUNDED → FULLY_FUNDED → SETTLEMENT → COMPLETED)
 * - Contribution tracking and attribution
 * - Circle webhook processing
 * - Settlement and refund handling
 */

export * from './types';
export * from './funding.service';
export * from './webhook.service';
