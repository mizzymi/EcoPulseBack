import { prisma } from '../db/prisma';
import { badRequest } from '../utils/httpError';

export async function registerDevice(userId: string, token: string, platform: string) {
  const t = (token ?? '').trim();
  const p = (platform ?? '').trim();
  if (!t) throw badRequest('token requerido');
  if (!p) throw badRequest('platform requerido');

  await prisma.deviceToken.upsert({
    where: { token: t },
    update: { userId, platform: p, revoked: false, lastSeen: new Date() },
    create: { userId, token: t, platform: p },
  });

  return { ok: true };
}
