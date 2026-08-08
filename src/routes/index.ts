import { Router } from 'express';
import healthRouter from './health';

const router = Router();

router.use('/health', healthRouter);

// Import routes
import identityRoutes from './identity';
import purchaseOrderRoutes from './purchaseOrder';
import dealRoutes from './deal';
import contributionRoutes from './contribution';
import paymentRoutes from './payment';
import webhookRoutes from './webhooks';
import fundingRoutes from './funding';
import rampRoutes from './ramp';
import settlementRoutes from './settlement';
import circleRoutes from './circle';

router.use('/identity', identityRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/deals', dealRoutes);
router.use('/contributions', contributionRoutes);
router.use('/payments', paymentRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/funding', fundingRoutes);
router.use('/ramp', rampRoutes);
router.use('/settlement', settlementRoutes);
router.use('/circle', circleRoutes);

export default router;
