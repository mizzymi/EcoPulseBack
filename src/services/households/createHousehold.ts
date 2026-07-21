import { HouseholdRole } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";

/**
 * Creates a household and assigns the creator as OWNER.
 */
export async function createHousehold(userId: string, name: string, currency = "EUR") {
    if (!name?.trim()) throw badRequest("Nombre requerido");

    const h = await prisma.household.create({
        data: { name: name.trim(), currency: currency?.trim() || "EUR" },
    });

    await prisma.householdMember.create({
        data: { householdId: h.id, userId, role: HouseholdRole.OWNER },
    });

    return h;
}