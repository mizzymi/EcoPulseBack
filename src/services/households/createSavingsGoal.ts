import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";
import { assertAdmin } from "./guards";
import { coercePositiveAmount } from "./helpers";

/**
 * Creates a savings goal (ADMIN/OWNER).
 */
export async function createSavingsGoal(
    userId: string,
    householdId: string,
    dto: { name: string; target: number | string; deadline?: string | Date },
) {
    await assertAdmin(userId, householdId);

    const target = coercePositiveAmount(dto.target);
    if (!dto.name?.trim()) throw badRequest("name requerido");

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
