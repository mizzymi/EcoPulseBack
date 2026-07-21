import { prisma } from "../../db/prisma";
import { HouseholdRole } from "@prisma/client";
import { forbidden, notFound } from "../../utils/httpError";
import { assertMember, getMembership } from "./guards";

/**
 * Deletes a planned item (creator or admin/owner).
 */
export async function deletePlanned(userId: string, householdId: string, plannedId: string) {
    await assertMember(userId, householdId);

    const planned = await prisma.householdPlanned.findUnique({ where: { id: plannedId } });
    if (!planned || planned.householdId !== householdId) throw notFound("Previsto no encontrado");

    const m = await getMembership(userId, householdId);
    const isAdmin = m && (m.role === HouseholdRole.OWNER || m.role === HouseholdRole.ADMIN);
    if (planned.createdBy !== userId && !isAdmin) throw forbidden();

    await prisma.householdPlanned.delete({ where: { id: plannedId } });
    return { ok: true };
}
