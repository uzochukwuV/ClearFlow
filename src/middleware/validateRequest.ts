import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: { field: string; message: string }[] = error.issues.map((issue: ZodIssue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors,
          },
        });
      }
      next(error);
    }
  };
};
