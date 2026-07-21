import { prisma } from "../../db/prisma";
import { notFound } from "../../utils/httpError";
import { assertMember } from "./guards";

/**
 * Lists savings transactions for a goal (member).
 */
export async function listSavingsTxns(userId: string, householdId: string, goalId: string) {
    await assertMember(userId, householdId);

    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.householdId !== householdId) throw notFound("Meta no encontrada");

    return prisma.savingsTxn.findMany({
        where: { goalId },
        orderBy: { occursAt: "desc" },
        take: 200,
    });
}
