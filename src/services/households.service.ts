import { prisma } from '../db/prisma';
import { notifications } from './notifications.service';
import { createHash, randomBytes } from 'crypto';
import { badRequest, forbidden, notFound } from '../utils/httpError';

type EntryKind = 'INCOME' | 'EXPENSE';

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}
function makeHumanCode(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function parseMonthStrict(ym?: string) {
  if (!ym) return null;
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}

function monthRangeUtc(ym: string) {
  const mm = parseMonthStrict(ym);
  if (!mm) throw badRequest('month debe ser YYYY-MM');
  const from = new Date(Date.UTC(mm.y, mm.m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(mm.y, mm.m, 0, 23, 59, 59, 999));
  return { from, to, ...mm };
}

function coercePositiveAmount(val: number | string | undefined) {
  const n = typeof val === 'string' ? Number(val) : val;
  if (!Number.isFinite(n) || (n as number) <= 0) throw badRequest('amount > 0');
  return n as number;
}

function coerceType(t?: string): EntryKind {
  const U = (t || '').toUpperCase();
  if (U !== 'INCOME' && U !== 'EXPENSE') throw badRequest('type debe ser INCOME o EXPENSE');
  return U as EntryKind;
}

function daysInMonth(y: number, m1to12: number) {
  return new Date(Date.UTC(y, m1to12, 0)).getUTCDate();
}

function parseByMonthDay(rrule?: string): number | null {
  if (!rrule) return null;
  const m = /BYMONTHDAY\s*=\s*(-?\d+)/i.exec(rrule);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return Math.trunc(v);
}

async function getMembership(userId: string, householdId: string) {
  return prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
  });
}

async function assertMember(userId: string, householdId: string) {
  const m = await getMembership(userId, householdId);
  if (!m) throw forbidden('No perteneces a esta cuenta');
  return m;
}

async function assertAdmin(userId: string, householdId: string) {
  const m = await assertMember(userId, householdId);
  if (m.role !== 'OWNER' && m.role !== 'ADMIN') throw forbidden('Requiere rol ADMIN/OWNER');
}

export async function createHousehold(userId: string, name: string, currency = 'EUR') {
  if (!name?.trim()) throw badRequest('Nombre requerido');
  const h = await prisma.household.create({ data: { name: name.trim(), currency: currency?.trim() || 'EUR' } });
  await prisma.householdMember.create({ data: { householdId: h.id, userId, role: 'OWNER' } });
  return h;
}

export async function deleteHousehold(userId: string, householdId: string) {
  const household = await prisma.household.findUnique({ where: { id: householdId }, select: { id: true } });
  if (!household) throw notFound('Household not found');

  const membership = await prisma.householdMember.findFirst({ where: { householdId, userId }, select: { role: true } });
  if (!membership) throw forbidden('Not a member of this household');
  if (membership.role !== 'OWNER') throw forbidden('Only the owner can delete this household');

  await prisma.household.delete({ where: { id: householdId } });
  return { ok: true };
}

export async function myHouseholds(userId: string) {
  const ms = await prisma.householdMember.findMany({
    where: { userId },
    include: { household: true },
    orderBy: { joinedAt: 'desc' },
  });

  return ms.map((m: { household: { id: any; name: any; currency: any; }; role: any; joinedAt: any; }) => ({
    id: m.household.id,
    name: m.household.name,
    currency: m.household.currency,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

export async function updateHousehold(userId: string, householdId: string, dto: { name?: string; currency?: string }) {
  await assertAdmin(userId, householdId);

  const data: any = {};
  if (dto.name !== undefined) {
    const name = dto.name.trim();
    if (!name) throw badRequest('name requerido');
    if (name.length > 64) throw badRequest('name demasiado largo');
    data.name = name;
  }

  if (dto.currency !== undefined) {
    const c = dto.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) throw badRequest('currency debe ser un código ISO de 3 letras');
    data.currency = c;
  }

  if (Object.keys(data).length === 0) throw badRequest('Nada para actualizar');

  return prisma.household.update({ where: { id: householdId }, data, select: { id: true, name: true, currency: true } });
}

/* ============== Invites / Join by code ============== */

export async function createInvite(
  userId: string,
  householdId: string,
  opts: { expiresInHours?: number; maxUses?: number; requireApproval?: boolean },
) {
  await assertAdmin(userId, householdId);
  const expiresInHours = opts.expiresInHours ?? 48;
  const maxUses = opts.maxUses ?? 10;
  const requireApproval = opts.requireApproval ?? true;

  if (expiresInHours < 1 || expiresInHours > 720) throw badRequest('expiresInHours entre 1–720');
  if (maxUses < 1 || maxUses > 999) throw badRequest('maxUses entre 1–999');

  const code = makeHumanCode(8);
  const codeHash = sha256(code + (process.env.INVITE_PEPPER || 'pepper'));
  const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

  await prisma.householdInvite.create({
    data: { householdId, codeHash, expiresAt, maxUses, requireApproval, createdBy: userId },
  });

  return { code, expiresAt, maxUses, requireApproval };
}

export async function joinByCode(userId: string, code: string) {
  if (!code?.trim()) throw badRequest('Código requerido');

  const normalized = code.trim().toUpperCase();
  const hash = sha256(normalized + (process.env.INVITE_PEPPER || 'pepper'));

  const invite = await prisma.householdInvite.findFirst({
    where: { codeHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!invite) throw badRequest('Código inválido o expirado');
  if (invite.uses >= invite.maxUses) throw badRequest('Este código ya alcanzó su límite de usos');

  const already = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: invite.householdId, userId } },
  });
  if (already) return { status: 'APPROVED', householdId: invite.householdId };

  if (invite.requireApproval) {
    const existsPending = await prisma.householdJoinRequest.findFirst({
      where: { householdId: invite.householdId, userId, status: 'PENDING' },
    });
    if (!existsPending) {
      await prisma.householdJoinRequest.create({
        data: { householdId: invite.householdId, userId, inviteId: invite.id },
      });
    }
    try { await notifications.notifyNewJoinRequest(invite.householdId, userId); } catch (_) {}
    return { status: 'PENDING', householdId: invite.householdId };
  }

  await prisma.$transaction(async (tx: { householdMember: { upsert: (arg0: { where: { householdId_userId: { householdId: any; userId: string; }; }; create: { householdId: any; userId: string; role: string; }; update: {}; }) => any; }; householdInvite: { update: (arg0: { where: { id: any; }; data: { uses: { increment: number; }; }; }) => any; }; }) => {
    await tx.householdMember.upsert({
      where: { householdId_userId: { householdId: invite.householdId, userId } },
      create: { householdId: invite.householdId, userId, role: 'MEMBER' },
      update: {},
    });

    await tx.householdInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
  });

  return { status: 'APPROVED', householdId: invite.householdId };
}

/* ============== Join requests & members ============== */

export async function listJoinRequests(
  userId: string,
  householdId: string,
  status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING',
) {
  await assertAdmin(userId, householdId);

  return prisma.householdJoinRequest.findMany({
    where: { householdId, status },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function decideJoinRequest(
  adminUserId: string,
  householdId: string,
  reqId: string,
  decision: 'APPROVED' | 'REJECTED',
) {
  await assertAdmin(adminUserId, householdId);

  const jr = await prisma.householdJoinRequest.findUnique({ where: { id: reqId } });
  if (!jr || jr.householdId !== householdId) throw notFound('Solicitud no encontrada');
  if (jr.status !== 'PENDING') throw badRequest('La solicitud ya fue resuelta');

  if (decision === 'APPROVED') {
    await prisma.$transaction(async (tx: { householdMember: { upsert: (arg0: { where: { householdId_userId: { householdId: string; userId: any; }; }; create: { householdId: string; userId: any; role: string; }; update: {}; }) => any; }; householdJoinRequest: { update: (arg0: { where: { id: string; }; data: { status: string; decidedAt: Date; decidedBy: string; }; }) => any; }; householdInvite: { update: (arg0: { where: { id: any; }; data: { uses: { increment: number; }; }; }) => any; }; }) => {
      await tx.householdMember.upsert({
        where: { householdId_userId: { householdId, userId: jr.userId } },
        create: { householdId, userId: jr.userId, role: 'MEMBER' },
        update: {},
      });

      await tx.householdJoinRequest.update({
        where: { id: reqId },
        data: { status: 'APPROVED', decidedAt: new Date(), decidedBy: adminUserId },
      });

      await tx.householdInvite.update({ where: { id: jr.inviteId }, data: { uses: { increment: 1 } } });
    });
  } else {
    await prisma.householdJoinRequest.update({
      where: { id: reqId },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedBy: adminUserId },
    });
  }

  try { await notifications.notifyJoinRequestDecision(householdId, jr.userId, decision); } catch (_) {}
  return { ok: true, status: decision };
}

export async function listMembers(userId: string, householdId: string) {
  await assertMember(userId, householdId);

  const members = await prisma.householdMember.findMany({
    where: { householdId },
    include: { user: { select: { id: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  return members.map((m: { userId: any; role: any; joinedAt: any; user: any; }) => ({
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    user: m.user,
  }));
}

/* ================= Ledger ================= */

export async function addEntry(
  userId: string,
  householdId: string,
  dto: { type: EntryKind; amount: number | string; category?: string; note?: string; occursAt?: string | Date },
) {
  await assertMember(userId, householdId);
  const t = coerceType(dto.type);
  const amountNum = coercePositiveAmount(dto.amount);
  const occursAt = dto.occursAt ? new Date(dto.occursAt) : new Date();

  return prisma.ledgerEntry.create({
    data: {
      householdId,
      userId,
      type: t,
      amount: amountNum,
      category: dto.category?.trim() || null,
      note: dto.note?.trim() || null,
      occursAt,
    },
  });
}

export async function listEntries(userId: string, householdId: string, q: { from?: string; to?: string; limit?: number }) {
  await assertMember(userId, householdId);

  const where: any = { householdId };
  if (q.from || q.to) {
    where.occursAt = {};
    if (q.from) where.occursAt.gte = new Date(q.from);
    if (q.to) where.occursAt.lte = new Date(q.to);
  }
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);

  return prisma.ledgerEntry.findMany({
    where,
    orderBy: { occursAt: 'desc' },
    take: limit,
  });
}

export async function monthlySummary(userId: string, householdId: string, month: string) {
  await assertMember(userId, householdId);
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('month debe ser YYYY-MM');

  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const curr = await prisma.ledgerEntry.groupBy({
    by: ['type'],
    where: { householdId, occursAt: { gte: from, lte: to } },
    _sum: { amount: true },
  });

  const prev = await prisma.ledgerEntry.groupBy({
    by: ['type'],
    where: { householdId, occursAt: { lt: from } },
    _sum: { amount: true },
  });

  const sumBy = (rows: { type: 'INCOME' | 'EXPENSE'; _sum: { amount: any } }[], t: 'INCOME' | 'EXPENSE') =>
    Number(rows.find((r) => r.type === t)?._sum.amount ?? 0);

  const income = sumBy(curr as any, 'INCOME');
  const expense = sumBy(curr as any, 'EXPENSE');
  const net = income - expense;

  const prevIncome = sumBy(prev as any, 'INCOME');
  const prevExpense = sumBy(prev as any, 'EXPENSE');
  const openingBalance = prevIncome - prevExpense;
  const closingBalance = openingBalance + net;

  return { month, openingBalance, income, expense, net, closingBalance };
}

export async function updateEntry(
  userId: string,
  householdId: string,
  entryId: string,
  dto: { type?: EntryKind; amount?: number | string; category?: string | null; note?: string | null; occursAt?: string | Date },
) {
  await assertMember(userId, householdId);

  const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.householdId !== householdId) throw notFound('Movimiento no encontrado');

  const m = await getMembership(userId, householdId);
  const isAdmin = m && (m.role === 'OWNER' || m.role === 'ADMIN');
  if (entry.userId !== userId && !isAdmin) throw forbidden();

  const data: any = {};
  if (dto.type) data.type = coerceType(dto.type);
  if (dto.amount !== undefined) data.amount = coercePositiveAmount(dto.amount);
  if (dto.category !== undefined) data.category = dto.category?.trim() || null;
  if (dto.note !== undefined) data.note = dto.note?.trim() || null;
  if (dto.occursAt !== undefined) {
    const d = new Date(dto.occursAt as any);
    if (isNaN(+d)) throw badRequest('occursAt inválido');
    data.occursAt = d;
  }

  return prisma.ledgerEntry.update({ where: { id: entryId }, data });
}

export async function deleteEntry(userId: string, householdId: string, entryId: string) {
  await assertMember(userId, householdId);

  const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.householdId !== householdId) throw notFound('Movimiento no encontrado');

  const m = await getMembership(userId, householdId);
  const isAdmin = m && (m.role === 'OWNER' || m.role === 'ADMIN');
  if (entry.userId !== userId && !isAdmin) throw forbidden();

  await prisma.ledgerEntry.delete({ where: { id: entryId } });
  return { ok: true };
}

/* ================= Savings ================= */

export async function createSavingsGoal(
  userId: string,
  householdId: string,
  dto: { name: string; target: number | string; deadline?: string | Date },
) {
  await assertAdmin(userId, householdId);
  const target = coercePositiveAmount(dto.target);
  if (!dto.name?.trim()) throw badRequest('name requerido');

  return prisma.savingsGoal.create({
    data: {
      householdId,
      name: dto.name.trim(),
      target,
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      createdBy: userId,
    },
  });
}

export async function listSavingsGoals(userId: string, householdId: string) {
  await assertMember(userId, householdId);
  const goals = await prisma.savingsGoal.findMany({ where: { householdId }, orderBy: { createdAt: 'desc' } });

  const sums = await prisma.savingsTxn.groupBy({
    by: ['goalId', 'type'],
    where: { goalId: { in: goals.map((g: { id: any; }) => g.id) } },
    _sum: { amount: true },
  });

  const map: Record<string, { deposit: number; withdraw: number }> = {};
  for (const s of sums as any) {
    const g = (map[s.goalId] ||= { deposit: 0, withdraw: 0 });
    const val = Number(s._sum.amount ?? 0);
    if (s.type === 'DEPOSIT') g.deposit += val;
    else g.withdraw += val;
  }

  return goals.map((g: { id: string | number; target: any; }) => {
    const agg = map[g.id] || { deposit: 0, withdraw: 0 };
    const saved = agg.deposit - agg.withdraw;
    const pct = Math.max(0, Math.min(100, (saved / Number(g.target)) * 100));
    return { ...g, saved, progress: Number.isFinite(pct) ? pct : 0 };
  });
}

export async function updateSavingsGoal(
  userId: string,
  householdId: string,
  goalId: string,
  dto: { name?: string; target?: number | string; deadline?: string | Date | null },
) {
  await assertAdmin(userId, householdId);
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.householdId !== householdId) throw notFound('Meta no encontrada');

  const data: any = {};
  if (dto.name !== undefined) {
    if (!dto.name.trim()) throw badRequest('name no puede ser vacío');
    data.name = dto.name.trim();
  }
  if (dto.target !== undefined) data.target = coercePositiveAmount(dto.target);
  if (dto.deadline !== undefined) data.deadline = dto.deadline === null ? null : new Date(dto.deadline as any);

  return prisma.savingsGoal.update({ where: { id: goalId }, data });
}

export async function deleteSavingsGoal(userId: string, householdId: string, goalId: string) {
  await assertAdmin(userId, householdId);
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.householdId !== householdId) throw notFound('Meta no encontrada');

  await prisma.$transaction(async (tx: { savingsTxn: { deleteMany: (arg0: { where: { goalId: string; }; }) => any; }; ledgerEntry: { deleteMany: (arg0: { where: { householdId: string; category: string; note: { contains: string; }; }; }) => any; }; savingsGoal: { delete: (arg0: { where: { id: string; }; }) => any; }; }) => {
    await tx.savingsTxn.deleteMany({ where: { goalId } });
    await tx.ledgerEntry.deleteMany({
      where: { householdId, category: 'Ahorros', note: { contains: `[AHORRO: ${goal.name}]` } },
    });
    await tx.savingsGoal.delete({ where: { id: goalId } });
  });

  return { ok: true };
}

export async function addSavingsTxn(
  userId: string,
  householdId: string,
  goalId: string,
  dto: { type: 'DEPOSIT' | 'WITHDRAW'; amount: number | string; note?: string; occursAt?: string | Date },
) {
  await assertMember(userId, householdId);
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.householdId !== householdId) throw notFound('Meta no encontrada');

  const t = (dto.type || '').toUpperCase();
  if (t !== 'DEPOSIT' && t !== 'WITHDRAW') throw badRequest('type inválido');

  const amt = coercePositiveAmount(dto.amount);
  const when = dto.occursAt ? new Date(dto.occursAt) : new Date();
  const cleanNote = dto.note?.trim() || null;

  return prisma.$transaction(async (tx: { savingsTxn: { create: (arg0: { data: { goalId: string; userId: string; type: any; amount: number; note: string | null; occursAt: Date; }; }) => any; }; ledgerEntry: { create: (arg0: { data: { householdId: string; userId: string; type: string; amount: number; category: string; note: string; occursAt: Date; }; }) => any; }; }) => {
    const savedTxn = await tx.savingsTxn.create({
      data: { goalId, userId, type: t as any, amount: amt, note: cleanNote, occursAt: when },
    });

    if (t === 'DEPOSIT') {
      const marker = `[AHORRO: ${goal.name}]`;
      await tx.ledgerEntry.create({
        data: {
          householdId,
          userId,
          type: 'EXPENSE',
          amount: amt,
          category: 'Ahorros',
          note: `${marker} ${cleanNote ? ` — ${cleanNote}` : ''}`,
          occursAt: when,
        },
      });
    }

    return savedTxn;
  });
}

export async function listSavingsTxns(userId: string, householdId: string, goalId: string) {
  await assertMember(userId, householdId);
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.householdId !== householdId) throw notFound('Meta no encontrada');

  return prisma.savingsTxn.findMany({ where: { goalId }, orderBy: { occursAt: 'desc' }, take: 200 });
}

export async function savingsGoalSummary(userId: string, householdId: string, goalId: string) {
  await assertMember(userId, householdId);
  const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal || goal.householdId !== householdId) throw notFound('Meta no encontrada');

  const grouped = await prisma.savingsTxn.groupBy({ by: ['type'], where: { goalId }, _sum: { amount: true } });

  const dep = Number((grouped as any).find((g: any) => g.type === 'DEPOSIT')?._sum.amount ?? 0);
  const wd = Number((grouped as any).find((g: any) => g.type === 'WITHDRAW')?._sum.amount ?? 0);
  const saved = dep - wd;
  const target = Number(goal.target);
  const progress = target > 0 ? Math.max(0, Math.min(100, (saved / target) * 100)) : 0;

  return { goal, saved, target, progress, remaining: Math.max(0, target - saved) };
}

/* ================= Planned ================= */

export async function listPlanned(userId: string, householdId: string, q: { month?: string }) {
  await assertMember(userId, householdId);

  const where: any = { householdId, settledAt: null };
  if (q.month) {
    const { from, to } = monthRangeUtc(q.month);
    where.dueDate = { gte: from, lte: to };
  }

  return prisma.householdPlanned.findMany({
    where,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 500,
  });
}

export async function createPlanned(
  userId: string,
  householdId: string,
  dto: { concept: string; amount: number | string; type: 'INCOME' | 'EXPENSE'; dueDate: string; month?: string; notes?: string; category?: string },
) {
  await assertMember(userId, householdId);

  if (!dto.concept?.trim()) throw badRequest('concept requerido');
  const type = coerceType(dto.type);
  const amount = coercePositiveAmount(dto.amount);
  const dueDate = new Date(dto.dueDate);
  if (isNaN(+dueDate)) throw badRequest('dueDate inválida');

  return prisma.householdPlanned.create({
    data: {
      householdId,
      createdBy: userId,
      concept: dto.concept.trim(),
      type,
      amount,
      dueDate,
      month: dto.month?.trim() || null,
      notes: dto.notes?.trim() || null,
      category: dto.category?.trim() || null,
      settledAt: null,
    },
  });
}

export async function updatePlanned(
  userId: string,
  householdId: string,
  plannedId: string,
  dto: { concept?: string; amount?: number | string; type?: 'INCOME' | 'EXPENSE'; dueDate?: string; month?: string | null; notes?: string | null; category?: string | null },
) {
  await assertMember(userId, householdId);

  const planned = await prisma.householdPlanned.findUnique({ where: { id: plannedId } });
  if (!planned || planned.householdId !== householdId) throw notFound('Previsto no encontrado');

  const m = await getMembership(userId, householdId);
  const isAdmin = m && (m.role === 'OWNER' || m.role === 'ADMIN');
  if (planned.createdBy !== userId && !isAdmin) throw forbidden();

  const data: any = {};
  if (dto.concept !== undefined) {
    if (!dto.concept.trim()) throw badRequest('concept vacío');
    data.concept = dto.concept.trim();
  }
  if (dto.amount !== undefined) data.amount = coercePositiveAmount(dto.amount);
  if (dto.type !== undefined) data.type = coerceType(dto.type);
  if (dto.dueDate !== undefined) {
    const d = new Date(dto.dueDate);
    if (isNaN(+d)) throw badRequest('dueDate inválida');
    data.dueDate = d;
  }
  if (dto.month !== undefined) data.month = dto.month ? dto.month.trim() : null;
  if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
  if (dto.category !== undefined) data.category = dto.category?.trim() || null;

  return prisma.householdPlanned.update({ where: { id: plannedId }, data });
}

export async function deletePlanned(userId: string, householdId: string, plannedId: string) {
  await assertMember(userId, householdId);

  const planned = await prisma.householdPlanned.findUnique({ where: { id: plannedId } });
  if (!planned || planned.householdId !== householdId) throw notFound('Previsto no encontrado');

  const m = await getMembership(userId, householdId);
  const isAdmin = m && (m.role === 'OWNER' || m.role === 'ADMIN');
  if (planned.createdBy !== userId && !isAdmin) throw forbidden();

  await prisma.householdPlanned.delete({ where: { id: plannedId } });
  return { ok: true };
}

export async function settlePlanned(userId: string, householdId: string, plannedId: string, _month?: string) {
  await assertMember(userId, householdId);

  const planned = await prisma.householdPlanned.findUnique({ where: { id: plannedId } });
  if (!planned || planned.householdId !== householdId) throw notFound('Previsto no encontrado');
  if (planned.settledAt) return { ok: true, alreadySettled: true };

  const occursAt = planned.dueDate;
  const entryType: EntryKind = planned.type as EntryKind;

  await prisma.$transaction(async (tx: { ledgerEntry: { create: (arg0: { data: { householdId: string; userId: string; type: EntryKind; amount: number; category: any; note: string; occursAt: any; }; }) => any; }; householdPlanned: { update: (arg0: { where: { id: any; }; data: { settledAt: Date; }; }) => any; }; }) => {
    await tx.ledgerEntry.create({
      data: {
        householdId,
        userId,
        type: entryType,
        amount: Number(planned.amount),
        category: planned.category,
        note: planned.notes ? `[PLANNED:${planned.concept}] ${planned.notes}` : `[PLANNED:${planned.concept}]`,
        occursAt,
      },
    });

    await tx.householdPlanned.update({ where: { id: planned.id }, data: { settledAt: new Date() } });
  });

  return { ok: true };
}

/* ================= Recurring ================= */

export async function listRecurring(userId: string, householdId: string, q: { month?: string }) {
  await assertMember(userId, householdId);

  const defs = await prisma.householdRecurring.findMany({
    where: { householdId, active: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  if (!q.month) return defs;

  const { y, m } = monthRangeUtc(q.month);
  const dim = daysInMonth(y, m);

  return defs.map((d: { rrule: any; dayOfMonth: number | null; amount: any; }) => {
    let dom: number | null = null;
    const bymd = parseByMonthDay(d.rrule || undefined);
    if (bymd !== null) dom = bymd;
    else if (typeof d.dayOfMonth === 'number') dom = d.dayOfMonth;

    if (!dom) dom = 1;
    let day = dom > 0 ? dom : dim + dom + 1;
    day = Math.max(1, Math.min(dim, day));

    const occursAt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
    return { ...d, occursAt, amount: Number(d.amount) };
  });
}

export async function createRecurring(
  userId: string,
  householdId: string,
  dto: { concept: string; amount: number | string; type: 'INCOME' | 'EXPENSE'; dayOfMonth?: number; rrule?: string; notes?: string; category?: string },
) {
  await assertAdmin(userId, householdId);

  if (!dto.concept?.trim()) throw badRequest('concept requerido');
  const type = coerceType(dto.type);
  const amount = coercePositiveAmount(dto.amount);

  let dayOfMonth: number | null = null;
  let rrule: string | null = null;

  if (dto.rrule && dto.rrule.trim().length) {
    rrule = dto.rrule.trim();
  } else if (dto.dayOfMonth !== undefined && dto.dayOfMonth !== null) {
    const d = Number(dto.dayOfMonth);
    if (!Number.isInteger(d)) throw badRequest('dayOfMonth inválido');
    dayOfMonth = Math.max(1, Math.min(31, d));
  } else {
    dayOfMonth = 1;
  }

  return prisma.householdRecurring.create({
    data: {
      householdId,
      createdBy: userId,
      active: true,
      concept: dto.concept.trim(),
      type,
      amount,
      dayOfMonth,
      rrule,
      notes: dto.notes?.trim() || null,
      category: dto.category?.trim() || null,
    },
  });
}

export async function updateRecurring(
  userId: string,
  householdId: string,
  recurringId: string,
  dto: { concept?: string; amount?: number | string; type?: 'INCOME' | 'EXPENSE'; dayOfMonth?: number | null; rrule?: string | null; notes?: string | null; category?: string | null },
) {
  await assertAdmin(userId, householdId);

  const rec = await prisma.householdRecurring.findUnique({ where: { id: recurringId } });
  if (!rec || rec.householdId !== householdId) throw notFound('Gasto fijo no encontrado');

  const data: any = {};
  if (dto.concept !== undefined) {
    if (!dto.concept.trim()) throw badRequest('concept vacío');
    data.concept = dto.concept.trim();
  }
  if (dto.amount !== undefined) data.amount = coercePositiveAmount(dto.amount);
  if (dto.type !== undefined) data.type = coerceType(dto.type);

  if (dto.rrule !== undefined || dto.dayOfMonth !== undefined) {
    if (dto.rrule !== undefined) {
      data.rrule = dto.rrule ? dto.rrule.trim() : null;
      data.dayOfMonth = null;
    } else {
      if (dto.dayOfMonth === null) {
        data.dayOfMonth = null;
        data.rrule = null;
      } else {
        const d = Number(dto.dayOfMonth);
        if (!Number.isInteger(d)) throw badRequest('dayOfMonth inválido');
        data.dayOfMonth = Math.max(1, Math.min(31, d));
        data.rrule = null;
      }
    }
  }

  if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
  if (dto.category !== undefined) data.category = dto.category?.trim() || null;

  return prisma.householdRecurring.update({ where: { id: recurringId }, data });
}

export async function deleteRecurring(userId: string, householdId: string, recurringId: string) {
  await assertAdmin(userId, householdId);

  const rec = await prisma.householdRecurring.findUnique({ where: { id: recurringId } });
  if (!rec || rec.householdId !== householdId) throw notFound('Gasto fijo no encontrado');

  await prisma.householdRecurring.delete({ where: { id: recurringId } });
  return { ok: true };
}

export async function postRecurringInstance(
  userId: string,
  householdId: string,
  recurringId: string,
  dto?: { month?: string; occursAt?: string | Date },
) {
  await assertMember(userId, householdId);

  const rec = await prisma.householdRecurring.findUnique({ where: { id: recurringId } });
  if (!rec || rec.householdId !== householdId) throw notFound('Gasto fijo no encontrado');
  if (!rec.active) throw badRequest('La regla no está activa');

  let occursAt: Date;
  if (dto?.occursAt) {
    const d = new Date(dto.occursAt as any);
    if (isNaN(+d)) throw badRequest('occursAt inválido');
    occursAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
  } else {
    const target = dto?.month
      ? parseMonthStrict(dto.month)
      : parseMonthStrict(`${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`);
    if (!target) throw badRequest('month debe ser YYYY-MM');

    const dim = daysInMonth(target.y, target.m);
    let dom: number | null = null;
    const bymd = parseByMonthDay(rec.rrule || undefined);
    if (bymd !== null) dom = bymd;
    else if (typeof rec.dayOfMonth === 'number') dom = rec.dayOfMonth;
    if (!dom) dom = 1;
    let day = dom > 0 ? dom : dim + dom + 1;
    day = Math.max(1, Math.min(dim, day));

    occursAt = new Date(Date.UTC(target.y, target.m - 1, day, 12, 0, 0, 0));
  }

  const dayStart = new Date(Date.UTC(occursAt.getUTCFullYear(), occursAt.getUTCMonth(), occursAt.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(occursAt.getUTCFullYear(), occursAt.getUTCMonth(), occursAt.getUTCDate(), 23, 59, 59, 999));

  const canonicalText = `[RECURRING: ${rec.concept}]`;

  const existing = await prisma.ledgerEntry.findFirst({
    where: { householdId, occursAt: { gte: dayStart, lte: dayEnd }, note: { contains: canonicalText } },
  });
  if (existing) return { ok: true, already: true, entry: existing };

  const entry = await prisma.ledgerEntry.create({
    data: {
      householdId,
      userId,
      type: rec.type as EntryKind,
      amount: Number(rec.amount),
      category: rec.category,
      note: rec.notes ? `${canonicalText} ${rec.notes}` : `${canonicalText}`,
      occursAt,
    },
  });

  return { ok: true, entry };
}
