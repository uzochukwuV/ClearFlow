import { Request, Response, NextFunction } from 'express';
import { logger } from '../config';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (resource: string = 'Resource') => {
  return new AppError(404, `${resource} not found`);
};

export const badRequest = (message: string, code?: string) => {
  return new AppError(400, message, code);
};

export const unauthorized = (message: string = 'Unauthorized') => {
  return new AppError(401, message);
};

export const forbidden = (message: string = 'Forbidden') => {
  return new AppError(403, message);
};

export const conflict = (message: string) => {
  return new AppError(409, message);
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  logger.error({ err, req: req.url, method: req.method }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
    },
  });
};
