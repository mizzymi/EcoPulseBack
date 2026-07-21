import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      message: err.message,
      statusCode: err.status,
      details: err.details ?? undefined,
    });
  }

  if (err?.code === 'P2002') {
    return res.status(409).json({
      message: 'Email ya registrado',
      statusCode: 409,
      code: 'P2002',
      meta: err?.meta,
    });
  }

  console.error(err);
  return res.status(500).json({
    message: 'Internal server error',
    statusCode: 500,
  });
}
