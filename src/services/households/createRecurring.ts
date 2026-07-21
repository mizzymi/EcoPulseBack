import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";
import { assertAdmin } from "./guards";
import { coerceMoneyType, coercePositiveAmount, coerceType } from "./helpers";

/**
 * Creates a recurring definition (ADMIN/OWNER).
 */
export async function createRecurring(
    userId: string,
    householdId: string,
    dto: {
        concept: string;
        amount: number | string;
        type: "INCOME" | "EXPENSE";
        dayOfMonth?: number;
        rrule?: string;
        notes?: string;
        category?: string;
        accountType?: unknown;
    },
) {
    await assertAdmin(userId, householdId);

    if (!dto.concept?.trim()) throw badRequest("concept requerido");

    const type = coerceType(dto.type);
    const amount = coercePositiveAmount(dto.amount);
    const accountType = coerceMoneyType(dto.accountType);

    let dayOfMonth: number | null = null;
    let rrule: string | null = null;

    if (dto.rrule && dto.rrule.trim().length) {
        rrule = dto.rrule.trim();
    } else if (dto.dayOfMonth !== undefined && dto.dayOfMonth !== null) {
        const d = Number(dto.dayOfMonth);
        if (!Number.isInteger(d)) throw badRequest("dayOfMonth inválido");
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
            accountType,
        },
    });
}
