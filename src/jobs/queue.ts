import Bull from 'bull';
import { config, logger } from '../config';

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

jobQueue.process('poll-ramp-order', 5, async (job) => {
  logger.info({ jobId: job.id }, 'Processing poll-ramp-order job');
  // Phase 7: Poll Cleanverse for fiat ramp order status
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
