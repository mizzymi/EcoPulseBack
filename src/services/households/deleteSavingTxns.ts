import { prisma } from '../../db/prisma';
import { HouseholdRole } from '@prisma/client';
import { forbidden, notFound } from '../../utils/httpError';
import { assertMember, getMembership } from './guards';

export async function deleteSavingTxn(
    userId: string,
    householdId: string,
    goalId: string,
    txnId: string,
) {
    await assertMember(userId, householdId);

    const txn = await prisma.savingsTxn.findUnique({ where: { id: txnId } });
    if (!txn || txn.goalId !== goalId) throw notFound('Movimiento no encontrado');

    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.householdId !== householdId) throw notFound('Meta no encontrada');

    const m = await getMembership(userId, householdId);
    const isAdmin = !!m && (m.role === HouseholdRole.OWNER || m.role === HouseholdRole.ADMIN);

    if (txn.userId !== userId && !isAdmin) throw forbidden();

    await prisma.savingsTxn.delete({ where: { id: txnId } });
    return { ok: true };
}
