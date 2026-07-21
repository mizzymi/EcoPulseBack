import { prisma } from "../../db/prisma";
import { assertMember } from "./guards";
import {
    coerceMoneyType,
    coerceType,
    daysInMonth,
    monthRangeUtc,
    parseByMonthDay,
} from "./helpers";

/**
 * Lists recurring definitions, optionally projected to a given month (member).
 */
export async function listRecurring(
    userId: string,
    householdId: string,
    q: { month?: string; accountType?: string; category?: string; type?: string },
) {
    await assertMember(userId, householdId);

    const where: any = { householdId, active: true };
    if (q.category) where.category = q.category;
    if (q.type) where.type = coerceType(q.type);
    if (q.accountType) where.accountType = coerceMoneyType(q.accountType);

    const defs = await prisma.householdRecurring.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
    });

    if (!q.month) return defs;

    const { y, m } = monthRangeUtc(q.month);
    const dim = daysInMonth(y, m);

    return defs.map((d: any) => {
        let dom: number | null = null;

        const bymd = parseByMonthDay(d.rrule || undefined);
        if (bymd !== null) dom = bymd;
        else if (typeof d.dayOfMonth === "number") dom = d.dayOfMonth;

        if (!dom) dom = 1;

        let day = dom > 0 ? dom : dim + dom + 1;
        day = Math.max(1, Math.min(dim, day));

        const occursAt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
        return { ...d, occursAt, amount: Number(d.amount) };
    });
}
