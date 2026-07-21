import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/httpError";
import { assertAdmin } from "./guards";
import { coercePositiveAmount } from "./helpers";

/**
 * Updates a savings goal (ADMIN/OWNER).
 */
export async function updateSavingsGoal(
    userId: string,
    householdId: string,
    goalId: string,
    dto: { name?: string; target?: number | string; deadline?: string | Date | null },
) {
    await assertAdmin(userId, householdId);

    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.householdId !== householdId) throw notFound("Meta no encontrada");

    const data: any = {};

    if (dto.name !== undefined) {
        if (!dto.name.trim()) throw badRequest("name no puede ser vacío");
        data.name = dto.name.trim();
    }

    if (dto.target !== undefined) data.target = coercePositiveAmount(dto.target);

    if (dto.deadline !== undefined) {
        data.deadline = dto.deadline === null ? null : new Date(dto.deadline as any);
    }

    return prisma.savingsGoal.update({ where: { id: goalId }, data });
}
