import { prisma } from "../../db/prisma";
import { SavingsTxnType } from "@prisma/client";
import { notFound } from "../../utils/httpError";
import { assertMember } from "./guards";

/**
 * Returns summary for a goal (member).
 */
export async function savingsGoalSummary(userId: string, householdId: string, goalId: string) {
    await assertMember(userId, householdId);

    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.householdId !== householdId) throw notFound("Meta no encontrada");

    const grouped = await prisma.savingsTxn.groupBy({
        by: ["type"],
        where: { goalId },
        _sum: { amount: true },
    });

    const dep = Number((grouped as any).find((g: any) => g.type === SavingsTxnType.DEPOSIT)?._sum.amount ?? 0);
    const wd = Number((grouped as any).find((g: any) => g.type === SavingsTxnType.WITHDRAW)?._sum.amount ?? 0);

    const saved = dep - wd;
    const target = Number(goal.target);
    const progress = target > 0 ? Math.max(0, Math.min(100, (saved / target) * 100)) : 0;

    return { goal, saved, target, progress, remaining: Math.max(0, target - saved) };
}
