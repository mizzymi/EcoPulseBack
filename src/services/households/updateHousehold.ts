import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";
import { assertAdmin } from "./guards";

/**
 * Updates household settings (ADMIN/OWNER).
 */
export async function updateHousehold(userId: string, householdId: string, dto: { name?: string; currency?: string }) {
    await assertAdmin(userId, householdId);

    const data: { name?: string; currency?: string } = {};

    if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (!name) throw badRequest("name requerido");
        if (name.length > 64) throw badRequest("name demasiado largo");
        data.name = name;
    }

    if (dto.currency !== undefined) {
        const c = dto.currency.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(c)) throw badRequest("currency debe ser un código ISO de 3 letras");
        data.currency = c;
    }

    if (Object.keys(data).length === 0) throw badRequest("Nada para actualizar");

    return prisma.household.update({
        where: { id: householdId },
        data,
        select: { id: true, name: true, currency: true },
    });
}
