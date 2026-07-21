import { prisma } from "../../db/prisma";
import { assertMember } from "./guards";
import { coerceMoneyType, coerceType } from "./helpers";

/**
 * Lists entries with optional filters.
 */
export async function listEntries(
    userId: string,
    householdId: string,
    q: { from?: string; to?: string; limit?: number; accountType?: string; category?: string; type?: string },
) {
    await assertMember(userId, householdId);

    const where: any = { householdId };

    if (q.from || q.to) {
        where.occursAt = {};
        if (q.from) where.occursAt.gte = new Date(q.from);
        if (q.to) where.occursAt.lte = new Date(q.to);
    }

    if (q.category) where.category = q.category;
    if (q.type) where.type = coerceType(q.type);
    if (q.accountType) where.accountType = coerceMoneyType(q.accountType);

    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);

    return prisma.ledgerEntry.findMany({
        where,
        orderBy: { occursAt: "desc" },
        take: limit,
    });
}
