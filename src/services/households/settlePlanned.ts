import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { notFound } from "../../utils/httpError";
import { assertMember } from "./guards";
import { EntryKind } from "./helpers";
import { utcDayStart } from "../../utils/utcDayStart";

/**
 * Settles a planned item by creating a LedgerEntry and marking planned as settled.
 * Backward compatible: still writes old LedgerEntry fields.
 * PRO: also writes plannedId + occursAtDay so we can dedupe reliably.
 */
export async function settlePlanned(userId: string, householdId: string, plannedId: string) {
    await assertMember(userId, householdId);

    const planned = await prisma.householdPlanned.findUnique({ where: { id: plannedId } });
    if (!planned || planned.householdId !== householdId) throw notFound("Previsto no encontrado");
    if (planned.settledAt) return { ok: true, alreadySettled: true };

    const occursAt = planned.dueDate;
    const occursAtDay = utcDayStart(occursAt);
    const entryType: EntryKind = planned.type as EntryKind;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.ledgerEntry.create({
            data: {
                householdId,
                userId,
                type: entryType,
                amount: Number(planned.amount),
                category: planned.category,
                note: planned.notes ? `[PLANNED:${planned.concept}] ${planned.notes}` : `[PLANNED:${planned.concept}]`,
                occursAt,
                accountType: planned.accountType,

                occursAtDay,
                plannedId: planned.id,
            },
        });

        await tx.householdPlanned.update({
            where: { id: planned.id },
            data: { settledAt: new Date() },
        });
    });

    return { ok: true };
}