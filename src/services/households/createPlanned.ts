import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";
import { assertMember } from "./guards";
import { coerceMoneyType, coercePositiveAmount, coerceType } from "./helpers";

/**
 * Creates a planned item (member).
 */
export async function createPlanned(
    userId: string,
    householdId: string,
    dto: {
        concept: string;
        amount: number | string;
        type: "INCOME" | "EXPENSE";
        dueDate: string;
        month?: string;
        notes?: string;
        category?: string;
        accountType?: unknown;
    },
) {
    await assertMember(userId, householdId);

    if (!dto.concept?.trim()) throw badRequest("concept requerido");

    const type = coerceType(dto.type);
    const amount = coercePositiveAmount(dto.amount);

    const dueDate = new Date(dto.dueDate);
    if (isNaN(+dueDate)) throw badRequest("dueDate inválida");

    const accountType = coerceMoneyType(dto.accountType);

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
            accountType,
            settledAt: null,
        },
    });
}
