import { prisma } from "../../db/prisma";
import { notFound } from "../../utils/httpError";
import { assertAdmin } from "./guards";

/**
 * Deletes a recurring definition (ADMIN/OWNER).
 */
export async function deleteRecurring(userId: string, householdId: string, recurringId: string) {
    await assertAdmin(userId, householdId);

    const rec = await prisma.householdRecurring.findUnique({ where: { id: recurringId } });
    if (!rec || rec.householdId !== householdId) throw notFound("Gasto fijo no encontrado");

    await prisma.householdRecurring.delete({ where: { id: recurringId } });
    return { ok: true };
}
