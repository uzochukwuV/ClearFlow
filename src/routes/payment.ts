import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';

const router = Router();

// Fiat Ramp - Placeholder for Phase 7
router.get('/fiat-ramp/quote', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 7: Fiat Ramp' }
  });
}));

router.post('/fiat-ramp/widget', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 7: Fiat Ramp' }
  });
}));

router.get('/fiat-ramp/order/:id', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 7: Fiat Ramp' }
  });
}));

// Payout - Placeholder for Phase 8-9
router.post('/payout/supplier', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 8: Deal Closure' }
  });
}));

router.post('/payout/investor', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 9: Delivery & Repayment' }
  });
}));

export default router;
