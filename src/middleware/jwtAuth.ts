import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtVerifyOptions } from '../config';
import { unauthorized } from '../utils/httpError';

type JwtPayload = jwt.JwtPayload & { sub?: string; email?: string };

export function verifyAccessToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');

  const decoded = jwt.verify(token, secret, jwtVerifyOptions());
  if (typeof decoded === 'string' || !('sub' in decoded) || !decoded.sub) {
    throw unauthorized();
  }
  return decoded as JwtPayload;
}

export function jwtAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return next(unauthorized());

  const token = auth.slice(7).trim();
  if (!token) return next(unauthorized());

  try {
    const decoded = verifyAccessToken(token);
    req.user = { id: decoded.sub!, email: decoded.email };
    return next();
  } catch {
    return next(unauthorized());
  }
}
