import { prisma } from "../../db/prisma";
import { HouseholdRole } from "@prisma/client";
import { badRequest, forbidden, notFound } from "../../utils/httpError";
import { assertMember, getMembership } from "./guards";
import { coerceMoneyType, coercePositiveAmount, coerceType, EntryKind } from "./helpers";

/**
 * Updates an entry (owner/admin can edit others, member can edit own).
 */
export async function updateEntry(
    userId: string,
    householdId: string,
    entryId: string,
    dto: {
        type?: EntryKind;
        amount?: number | string;
        category?: string | null;
        note?: string | null;
        occursAt?: string | Date;
        accountType?: unknown;
    },
) {
    await assertMember(userId, householdId);

    const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.householdId !== householdId) throw notFound("Movimiento no encontrado");

    const m = await getMembership(userId, householdId);
    const isAdmin = m && (m.role === HouseholdRole.OWNER || m.role === HouseholdRole.ADMIN);
    if (entry.userId !== userId && !isAdmin) throw forbidden();

    const data: any = {};
    if (dto.type) data.type = coerceType(dto.type);
    if (dto.amount !== undefined) data.amount = coercePositiveAmount(dto.amount);
    if (dto.category !== undefined) data.category = dto.category?.trim() || null;
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.accountType !== undefined) data.accountType = coerceMoneyType(dto.accountType);

    if (dto.occursAt !== undefined) {
        const d = new Date(dto.occursAt as any);
        if (isNaN(+d)) throw badRequest("occursAt inválido");
        data.occursAt = d;
    }

    return prisma.ledgerEntry.update({ where: { id: entryId }, data });
}
