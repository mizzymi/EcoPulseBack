import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : (err?.statusCode ?? 500);
  const message = err instanceof HttpError ? err.message : (err?.message ?? 'Error interno');

  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', err);
  }

  res.status(status).json({
    error: message,
    ...(err instanceof HttpError && err.details ? { details: err.details } : {}),
  });
}
