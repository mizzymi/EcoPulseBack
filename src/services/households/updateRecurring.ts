import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/httpError";
import { assertAdmin } from "./guards";
import { coerceMoneyType, coercePositiveAmount, coerceType } from "./helpers";

/**
 * Updates a recurring definition (ADMIN/OWNER).
 */
export async function updateRecurring(
    userId: string,
    householdId: string,
    recurringId: string,
    dto: {
        concept?: string;
        amount?: number | string;
        type?: "INCOME" | "EXPENSE";
        dayOfMonth?: number | null;
        rrule?: string | null;
        notes?: string | null;
        category?: string | null;
        accountType?: unknown;
    },
) {
    await assertAdmin(userId, householdId);

    const rec = await prisma.householdRecurring.findUnique({ where: { id: recurringId } });
    if (!rec || rec.householdId !== householdId) throw notFound("Gasto fijo no encontrado");

    const data: any = {};

    if (dto.concept !== undefined) {
        if (!dto.concept.trim()) throw badRequest("concept vacío");
        data.concept = dto.concept.trim();
    }

    if (dto.amount !== undefined) data.amount = coercePositiveAmount(dto.amount);
    if (dto.type !== undefined) data.type = coerceType(dto.type);
    if (dto.accountType !== undefined) data.accountType = coerceMoneyType(dto.accountType);

    // Mutually exclusive dayOfMonth vs rrule
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
                if (!Number.isInteger(d)) throw badRequest("dayOfMonth inválido");
                data.dayOfMonth = Math.max(1, Math.min(31, d));
                data.rrule = null;
            }
        }
    }

    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.category !== undefined) data.category = dto.category?.trim() || null;

    return prisma.householdRecurring.update({ where: { id: recurringId }, data });
}
