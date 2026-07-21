import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/httpError";
import { utcDayStart } from "../../utils/utcDayStart";
import { assertMember } from "./guards";
import { daysInMonth, EntryKind, parseByMonthDay, parseMonthStrict } from "./helpers";

/**
 * Posts a recurring instance as a LedgerEntry if not already posted for that day (member).
 * Backward compatible: writes old LedgerEntry fields.
 * PRO: dedupe by (recurringId, occursAtDay).
 * Legacy fallback: avoids duplicates with old entries created before the migration.
 */
export async function postRecurringInstance(
    userId: string,
    householdId: string,
    recurringId: string,
    dto?: { month?: string; occursAt?: string | Date },
) {
    await assertMember(userId, householdId);

    const rec = await prisma.householdRecurring.findUnique({ where: { id: recurringId } });
    if (!rec || rec.householdId !== householdId) throw notFound("Gasto fijo no encontrado");
    if (!rec.active) throw badRequest("La regla no está activa");

    let occursAt: Date;

    if (dto?.occursAt) {
        const d = new Date(dto.occursAt as any);
        if (isNaN(+d)) throw badRequest("occursAt inválido");
        occursAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
    } else {
        const target = dto?.month
            ? parseMonthStrict(dto.month)
            : parseMonthStrict(`${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`);

        if (!target) throw badRequest("month debe ser YYYY-MM");

        const dim = daysInMonth(target.y, target.m);

        let dom: number | null = null;
        const bymd = parseByMonthDay(rec.rrule || undefined);
        if (bymd !== null) dom = bymd;
        else if (typeof rec.dayOfMonth === "number") dom = rec.dayOfMonth;

        if (!dom) dom = 1;

        let day = dom > 0 ? dom : dim + dom + 1;
        day = Math.max(1, Math.min(dim, day));

        occursAt = new Date(Date.UTC(target.y, target.m - 1, day, 12, 0, 0, 0));
    }

    const occursAtDay = utcDayStart(occursAt);

    const existingPro = await prisma.ledgerEntry.findFirst({
        where: { householdId, recurringId: rec.id, occursAtDay },
    });
    if (existingPro) return { ok: true, already: true, entry: existingPro };

    const canonicalText = `[RECURRING: ${rec.concept}]`;
    const existingLegacy = await prisma.ledgerEntry.findFirst({
        where: { householdId, occursAtDay, note: { contains: canonicalText } },
    });
    if (existingLegacy) return { ok: true, already: true, entry: existingLegacy };

    const entry = await prisma.ledgerEntry.create({
        data: {
            householdId,
            userId,
            type: rec.type as EntryKind,
            amount: Number(rec.amount),
            category: rec.category,
            note: rec.notes ? `${canonicalText} ${rec.notes}` : canonicalText,
            occursAt,
            accountType: rec.accountType,

            occursAtDay,
            recurringId: rec.id,
        },
    });

    return { ok: true, entry };
}