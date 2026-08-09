import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

router.get('/ready', (req: Request, res: Response) => {
  // Add database and external service checks here
  res.json({
    success: true,
    data: {
      ready: true,
      services: {
        database: 'connected',
      },
    },
  });
});

export default router;
