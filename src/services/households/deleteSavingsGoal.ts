import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { notFound } from "../../utils/httpError";
import { assertAdmin } from "./guards";

/**
 * Deletes a savings goal and its transactions (ADMIN/OWNER).
 */
export async function deleteSavingsGoal(userId: string, householdId: string, goalId: string) {
    await assertAdmin(userId, householdId);

    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.householdId !== householdId) throw notFound("Meta no encontrada");

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.savingsTxn.deleteMany({ where: { goalId } });

        await tx.savingsGoal.delete({ where: { id: goalId } });
    });

    return { ok: true };
}
