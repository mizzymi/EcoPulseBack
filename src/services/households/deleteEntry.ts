import { prisma } from "../../db/prisma";
import { HouseholdRole } from "@prisma/client";
import { forbidden, notFound } from "../../utils/httpError";
import { assertMember, getMembership } from "./guards";

/**
 * Deletes an entry (owner/admin can delete others, member can delete own).
 */
export async function deleteEntry(userId: string, householdId: string, entryId: string) {
    await assertMember(userId, householdId);

    const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.householdId !== householdId) throw notFound("Movimiento no encontrado");

    const m = await getMembership(userId, householdId);
    const isAdmin = m && (m.role === HouseholdRole.OWNER || m.role === HouseholdRole.ADMIN);
    if (entry.userId !== userId && !isAdmin) throw forbidden();

    await prisma.ledgerEntry.delete({ where: { id: entryId } });
    return { ok: true };
}
