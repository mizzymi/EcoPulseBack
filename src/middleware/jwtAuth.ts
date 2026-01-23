import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '../utils/httpError';

type JwtPayload = { sub?: string; email?: string } & Record<string, any>;

export function jwtAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return next(unauthorized());

  const token = auth.slice(7).trim();
  if (!token) return next(unauthorized());

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not set');

    const decoded = jwt.verify(token, secret) as JwtPayload;
    const id = decoded.sub;
    if (!id) return next(unauthorized());

    req.user = { id, email: decoded.email };
    return next();
  } catch (e) {
    return next(unauthorized());
  }
}
