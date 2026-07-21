import { prisma } from "../../db/prisma";
import { forbidden } from "../../utils/httpError";
import { HouseholdRole } from "@prisma/client";

export async function getMembership(userId: string, householdId: string) {
    return prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId, userId } },
    });
}

export async function assertMember(userId: string, householdId: string) {
    const m = await getMembership(userId, householdId);
    if (!m) throw forbidden("No perteneces a esta cuenta");
    return m;
}

export async function assertAdmin(userId: string, householdId: string) {
    const m = await assertMember(userId, householdId);
    if (m.role !== HouseholdRole.OWNER && m.role !== HouseholdRole.ADMIN) {
        throw forbidden("Requiere rol ADMIN/OWNER");
    }
    return m;
}
