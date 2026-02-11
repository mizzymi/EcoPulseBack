import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { badRequest, unauthorized } from '../utils/httpError';
import { notifications } from './notifications.service';

function hmacBase64Url(data: string, key: string) {
  return createHmac('sha256', key).update(data).digest('base64url');
}

export async function register(email: string, password: string) {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) throw badRequest('Email requerido');

  const exists = await prisma.user.findUnique({ where: { email: e } });
  if (exists) throw badRequest('Email ya registrado');

  if (!password || password.length < 6) throw badRequest('Contraseña mínima 6 caracteres');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: e, passwordHash },
    select: { id: true, email: true, createdAt: true },
  });

  const accessToken = sign(user.id, user.email);
  return { accessToken, user };
}

export async function login(email: string, password: string) {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) throw badRequest('Email requerido');
  if (!password) throw badRequest('Contraseña requerida');

  // ✅ Same message for "email not found" and "wrong password"
  const invalidCreds = () => unauthorized('Correo o contraseña equivocado');

  const user = await prisma.user.findUnique({ where: { email: e } });
  if (!user) throw invalidCreds();

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw invalidCreds();

  const accessToken = sign(user.id, user.email);
  return { accessToken, user: { id: user.id, email: user.email, createdAt: user.createdAt } };
}

export async function me(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });
}

/* ================= Password reset ================= */

function makeResetToken(userId: string, passwordHash: string) {
  const ts = Date.now().toString();
  const secret = process.env.RESET_SECRET || 'reset-secret';
  const pepper = process.env.RESET_PEPPER || 'pepper';
  const payload = `${userId}.${ts}`;
  const sig = hmacBase64Url(`${payload}|${passwordHash}|${pepper}`, secret);
  return `${userId}.${ts}.${sig}`;
}

async function verifyResetToken(token: string) {
  const parts = (token ?? '').split('.');
  if (parts.length !== 3) throw badRequest('Token inválido');

  const [userId, tsStr, sig] = parts;
  const ts = Number(tsStr);
  if (!userId || !Number.isFinite(ts)) throw badRequest('Token inválido');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest('Token inválido');

  const windowMs = Number(process.env.RESET_WINDOW_MINUTES || '30') * 60_000;
  if (Date.now() - ts > windowMs) throw badRequest('Token expirado');

  const secret = process.env.RESET_SECRET || 'reset-secret';
  const pepper = process.env.RESET_PEPPER || 'pepper';
  const payload = `${userId}.${tsStr}`;
  const expected = hmacBase64Url(`${payload}|${user.passwordHash}|${pepper}`, secret);
  if (expected !== sig) throw badRequest('Token inválido');

  return user;
}

export async function requestPasswordReset(email: string) {
  const e = (email ?? '').trim().toLowerCase();
  if (!e) return;

  const user = await prisma.user.findUnique({ where: { email: e } });
  if (!user) {
    // We don't reveal if the email exists
    console.warn('[AUTH] forgot: email no encontrado:', e);
    return;
  }

  const token = makeResetToken(user.id, user.passwordHash);
  const link =
    `https://ecopulse.reimii.com/reset-password?code=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

  try {
    await notifications.sendPasswordResetCode(user.email, token, link);
  } catch (err) {
    console.error('[AUTH] Error enviando reset email:', err);
  }
}

export async function resetPassword(token: string, newPassword: string) {
  if (!newPassword || newPassword.length < 6) throw badRequest('password mínimo 6 caracteres');

  const user = await verifyResetToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  try {
    await notifications.notifyPasswordChanged(user.email);
  } catch (_) { }

  return { ok: true };
}

/* ================= JWT ================= */

function sign(sub: string, email: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');
  return jwt.sign({ sub, email }, secret, { expiresIn: '7d' });
}
