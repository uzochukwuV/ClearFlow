import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware';

const router = Router();

// Placeholder for Phase 6: Funding
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 6: Funding' }
  });
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: { message: 'Not implemented - See Phase 6: Funding' }
  });
}));

export default router;
