import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

const MIN_SECRET_LENGTH = 32;

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function strongSecret(name: string): string {
  const value = required(name);
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must contain at least ${MIN_SECRET_LENGTH} characters`);
  }
  return value;
}

export function validateEnvironment(): void {
  required('DATABASE_URL');
  strongSecret('JWT_SECRET');
  strongSecret('HASH');

  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '12');
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15');
  }

  const resetWindow = Number(process.env.RESET_WINDOW_MINUTES ?? '30');
  if (!Number.isFinite(resetWindow) || resetWindow <= 0 || resetWindow > 1440) {
    throw new Error('RESET_WINDOW_MINUTES must be between 1 and 1440');
  }
}

export function jwtVerifyOptions(): VerifyOptions {
  return {
    algorithms: ['HS256'],
    issuer: process.env.JWT_ISSUER?.trim() || undefined,
    audience: process.env.JWT_AUDIENCE?.trim() || undefined,
  };
}

export function jwtSignOptions(): SignOptions {
  return {
    algorithm: 'HS256',
    expiresIn: '7d',
    issuer: process.env.JWT_ISSUER?.trim() || undefined,
    audience: process.env.JWT_AUDIENCE?.trim() || undefined,
  };
}

export function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? process.env.APP_URL_MAIN ?? process.env.APP_URL ?? '';
  return raw.split(',').map(normalizeOrigin).filter(Boolean);
}
