import { prisma } from "../../db/prisma";
import { HouseholdRole } from "@prisma/client";
import { badRequest, forbidden, notFound } from "../../utils/httpError";
import { assertMember } from "./guards";

function coerceHouseholdRole(input: unknown): HouseholdRole {
    const r = String(input ?? "").toUpperCase();
    if (r !== "ADMIN" && r !== "MEMBER") throw badRequest("role inválido");
    return r as HouseholdRole;
}

function canEditRole(actor: HouseholdRole, target: HouseholdRole, newRole: HouseholdRole) {
    if (target === HouseholdRole.OWNER) return false;
    if (actor === HouseholdRole.OWNER) return true;

    if (actor === HouseholdRole.ADMIN) {
        if (target !== HouseholdRole.MEMBER) return false;
        if (newRole !== HouseholdRole.MEMBER) return false;
        return true;
    }

    return false;
}

/**
 * Updates a member role (ADMIN/OWNER rules).
 */
export async function updateMemberRole(
    actorUserId: string,
    householdId: string,
    targetUserId: string,
    body: { role?: unknown },
) {
    const actor = await assertMember(actorUserId, householdId);

    const target = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId: targetUserId } },
    });
    if (!target) throw notFound("Miembro no encontrado");

    const newRole = coerceHouseholdRole(body.role);

    if (!canEditRole(actor.role, target.role, newRole)) {
        throw forbidden("No tienes permisos para cambiar este rol");
    }

    return prisma.householdMember.update({
        where: { householdId_userId: { householdId, userId: targetUserId } },
        data: { role: newRole },
        select: {
            householdId: true,
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: { id: true, emailHash: true } },
        },
    });
}
