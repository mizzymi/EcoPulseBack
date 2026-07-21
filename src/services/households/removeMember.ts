import { prisma } from "../../db/prisma";
import { HouseholdRole } from "@prisma/client";
import { forbidden, notFound } from "../../utils/httpError";
import { assertMember } from "./guards";

function canKick(actor: HouseholdRole, target: HouseholdRole) {
    if (target === HouseholdRole.OWNER) return false;
    if (actor === HouseholdRole.OWNER) return true;
    if (actor === HouseholdRole.ADMIN) return target === HouseholdRole.MEMBER;
    return false;
}

/**
 * Removes a member from household.
 */
export async function removeMember(actorUserId: string, householdId: string, targetUserId: string) {
    const actor = await assertMember(actorUserId, householdId);

    const target = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId: targetUserId } },
    });
    if (!target) throw notFound("Miembro no encontrado");

    if (!canKick(actor.role, target.role)) {
        throw forbidden("No tienes permisos para expulsar a este miembro");
    }

    await prisma.householdMember.delete({
        where: { householdId_userId: { householdId, userId: targetUserId } },
    });

    return { ok: true };
}
