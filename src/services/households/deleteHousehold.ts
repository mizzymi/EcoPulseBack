import { HouseholdRole } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { notFound, forbidden } from "../../utils/httpError";

/**
 * Deletes a household (OWNER only).
 */
export async function deleteHousehold(userId: string, householdId: string) {
    const household = await prisma.household.findUnique({ where: { id: householdId }, select: { id: true } });
    if (!household) throw notFound("Household not found");

    const membership = await prisma.householdMember.findFirst({ where: { householdId, userId }, select: { role: true } });
    if (!membership) throw forbidden("Not a member of this household");
    if (membership.role !== HouseholdRole.OWNER) throw forbidden("Only the owner can delete this household");

    await prisma.household.delete({ where: { id: householdId } });
    return { ok: true };
}
