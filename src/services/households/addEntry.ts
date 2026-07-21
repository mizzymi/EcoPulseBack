import { prisma } from "../../db/prisma";
import { assertMember } from "./guards";
import { coerceMoneyType, coercePositiveAmount, coerceType, EntryKind } from "./helpers";

/**
 * Adds a ledger entry.
 */
export async function addEntry(
    userId: string,
    householdId: string,
    dto: {
        type: EntryKind;
        amount: number | string;
        category?: string;
        note?: string;
        occursAt?: string | Date;
        accountType?: unknown;
    },
) {
    await assertMember(userId, householdId);

    const t = coerceType(dto.type);
    const amountNum = coercePositiveAmount(dto.amount);
    const occursAt = dto.occursAt ? new Date(dto.occursAt) : new Date();
    const accountType = coerceMoneyType(dto.accountType);

    return prisma.ledgerEntry.create({
        data: {
            householdId,
            userId,
            type: t,
            amount: amountNum,
            category: dto.category?.trim() || null,
            note: dto.note?.trim() || null,
            occursAt,
            accountType,
        },
    });
}
