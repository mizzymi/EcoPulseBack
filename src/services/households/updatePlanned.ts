import { prisma } from "../../db/prisma";
import { HouseholdRole } from "@prisma/client";
import { badRequest, forbidden, notFound } from "../../utils/httpError";
import { assertMember, getMembership } from "./guards";
import { coerceMoneyType, coercePositiveAmount, coerceType } from "./helpers";

/**
 * Updates a planned item (creator or admin/owner).
 */
export async function updatePlanned(
    userId: string,
    householdId: string,
    plannedId: string,
    dto: {
        concept?: string;
        amount?: number | string;
        type?: "INCOME" | "EXPENSE";
        dueDate?: string;
        month?: string | null;
        notes?: string | null;
        category?: string | null;
        accountType?: unknown;
    },
) {
    await assertMember(userId, householdId);

    const planned = await prisma.householdPlanned.findUnique({ where: { id: plannedId } });
    if (!planned || planned.householdId !== householdId) throw notFound("Previsto no encontrado");

    const m = await getMembership(userId, householdId);
    const isAdmin = m && (m.role === HouseholdRole.OWNER || m.role === HouseholdRole.ADMIN);
    if (planned.createdBy !== userId && !isAdmin) throw forbidden();

    const data: any = {};

    if (dto.concept !== undefined) {
        if (!dto.concept.trim()) throw badRequest("concept vacío");
        data.concept = dto.concept.trim();
    }

    if (dto.amount !== undefined) data.amount = coercePositiveAmount(dto.amount);

    if (dto.type !== undefined) data.type = coerceType(dto.type);

    if (dto.dueDate !== undefined) {
        const d = new Date(dto.dueDate);
        if (isNaN(+d)) throw badRequest("dueDate inválida");
        data.dueDate = d;
    }

    if (dto.month !== undefined) data.month = dto.month ? dto.month.trim() : null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.category !== undefined) data.category = dto.category?.trim() || null;
    if (dto.accountType !== undefined) data.accountType = coerceMoneyType(dto.accountType);

    return prisma.householdPlanned.update({ where: { id: plannedId }, data });
}
