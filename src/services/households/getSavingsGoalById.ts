import { prisma } from '../../db/prisma';
import { notFound } from '../../utils/httpError';
import { assertMember } from './guards';

export async function getSavingsGoalById(userId: string, goalId: string) {
    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal) throw notFound('Meta no encontrada');
    await assertMember(userId, goal.householdId);

    return goal;
}
