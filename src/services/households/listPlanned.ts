import { prisma } from "../../db/prisma";
import { assertMember } from "./guards";
import { coerceMoneyType, coerceType, monthRangeUtc } from "./helpers";

/**
 * Lists planned items (unsettled) with optional filters.
 */
export async function listPlanned(
    userId: string,
    householdId: string,
    q: { month?: string; accountType?: string; category?: string; type?: string },
) {
    await assertMember(userId, householdId);

    const where: any = { householdId, settledAt: null };

    if (q.month) {
        const { from, to } = monthRangeUtc(q.month);
        where.dueDate = { gte: from, lte: to };
    }

    if (q.category) where.category = q.category;
    if (q.type) where.type = coerceType(q.type);
    if (q.accountType) where.accountType = coerceMoneyType(q.accountType);

    return prisma.householdPlanned.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        take: 500,
    });
}
