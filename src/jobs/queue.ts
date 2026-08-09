import Bull from 'bull';
import { config, logger } from '../config';
import { prisma } from '../config/database';
import { ContributionStatus, ContributionType } from '@prisma/client';
import { getDepositVerificationService } from '../services/funding';
import { getDealService } from '../services/deal';

export const jobQueue = new Bull('clearflow', config.REDIS_URL);

// Job processors
jobQueue.process('poll-apass-status', 5, async (job) => {
  logger.info({ jobId: job.id }, 'Processing poll-apass-status job');
  // Phase 2: Poll Cleanverse for A-Pass status updates
});

jobQueue.process('poll-atoken-issuance', 5, async (job) => {
  logger.info({ jobId: job.id }, 'Processing poll-atoken-issuance job');
  // Phase 5: Poll Cleanverse for A-Token issuance status
});

/**
 * Poll a single FIAT contribution's ramp order until COMPLETED, then verify
 * the USDC landed in the deal wallet and mint tokens.
 *
 * Job data: { contributionId: string }
 */
jobQueue.process('poll-ramp-order', 5, async (job) => {
  const { contributionId } = job.data as { contributionId: string };
  logger.info({ jobId: job.id, contributionId }, 'Processing poll-ramp-order job');

  const contribution = await prisma.contribution.findUnique({
    where: { id: contributionId },
    select: { type: true, status: true },
  });
  if (!contribution) {
    logger.warn({ contributionId }, 'poll-ramp-order: contribution not found');
    return;
  }
  if (contribution.status === ContributionStatus.CONFIRMED) {
    logger.info({ contributionId }, 'poll-ramp-order: already confirmed');
    return;
  }
  if (contribution.type !== ContributionType.FIAT) {
    logger.warn({ contributionId, type: contribution.type }, 'poll-ramp-order: not a FIAT contribution');
    return;
  }

  const verificationService = getDepositVerificationService();
  const result = await verificationService.verifyFiatDeposit(contributionId);
  if (result.verified) {
    await getDealService().mintTokensForContribution(contributionId);
    logger.info({ contributionId, rampOrderId: result.rampOrderId }, 'poll-ramp-order: verified + minted');
  } else {
    // Re-throw so Bull retries with exponential backoff until the order settles.
    throw new Error(result.error || 'Ramp order not yet completed');
  }
});

/**
 * Verify a CRYPTO contribution's on-chain deposit and mint tokens once
 * the inbound USDC transfer is confirmed by Circle.
 *
 * Job data: { contributionId: string }
 */
jobQueue.process('verify-deposit', 5, async (job) => {
  const { contributionId } = job.data as { contributionId: string };
  logger.info({ jobId: job.id, contributionId }, 'Processing verify-deposit job');

  const contribution = await prisma.contribution.findUnique({
    where: { id: contributionId },
    select: { type: true, status: true },
  });
  if (!contribution) {
    logger.warn({ contributionId }, 'verify-deposit: contribution not found');
    return;
  }
  if (contribution.status === ContributionStatus.CONFIRMED) {
    logger.info({ contributionId }, 'verify-deposit: already confirmed');
    return;
  }

  const verificationService = getDepositVerificationService();
  const result =
    contribution.type === ContributionType.FIAT
      ? await verificationService.verifyFiatDeposit(contributionId)
      : await verificationService.verifyCryptoDeposit(contributionId);

  if (result.verified) {
    await getDealService().mintTokensForContribution(contributionId);
    logger.info({ contributionId }, 'verify-deposit: verified + minted');
  } else {
    throw new Error(result.error || 'Deposit not yet confirmed');
  }
});

jobQueue.process('check-deal-deadline', async (job) => {
  logger.info({ jobId: job.id }, 'Processing check-deal-deadline job');
  // Phase 6: Check and close deals past funding deadline
});

jobQueue.process('check-delivery-deadline', async (job) => {
  logger.info({ jobId: job.id }, 'Processing check-delivery-deadline job');
  // Phase 9: Check for overdue deliveries
});

jobQueue.process('process-default', async (job) => {
  logger.info({ jobId: job.id }, 'Processing process-default job');
  // Phase 10: Handle deal defaults
});

// Event listeners
jobQueue.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

jobQueue.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Job failed');
});

jobQueue.on('stalled', (job) => {
  logger.warn({ jobId: job?.id }, 'Job stalled');
});

// Helper functions to add jobs
export const addJob = async (
  name: string,
  data: Record<string, any>,
  options?: { delay?: number; attempts?: number }
) => {
  return jobQueue.add(name, data, {
    attempts: options?.attempts || 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
    ...options,
  });
};
