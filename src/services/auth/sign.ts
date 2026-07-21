import jwt from 'jsonwebtoken';
import { jwtSignOptions } from '../../config';

export function sign(sub: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({}, secret, { ...jwtSignOptions(), subject: sub });
}
