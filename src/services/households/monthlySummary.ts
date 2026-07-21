import { prisma } from "../../db/prisma";
import { EntryType } from "@prisma/client";
import { badRequest } from "../../utils/httpError";
import { assertMember } from "./guards";

/**
 * Returns a monthly summary for a household (income/expense/net + opening/closing balance).
 */
export async function monthlySummary(userId: string, householdId: string, month: string) {
    await assertMember(userId, householdId);

    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("month debe ser YYYY-MM");

    const [y, m] = month.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

    const curr = await prisma.ledgerEntry.groupBy({
        by: ["type"],
        where: { householdId, occursAt: { gte: from, lte: to } },
        _sum: { amount: true },
    });

    const prev = await prisma.ledgerEntry.groupBy({
        by: ["type"],
        where: { householdId, occursAt: { lt: from } },
        _sum: { amount: true },
    });

    const sumBy = (rows: { type: EntryType; _sum: { amount: any } }[], t: EntryType) =>
        Number(rows.find((r) => r.type === t)?._sum.amount ?? 0);

    const income = sumBy(curr as any, EntryType.INCOME);
    const expense = sumBy(curr as any, EntryType.EXPENSE);
    const net = income - expense;

    const prevIncome = sumBy(prev as any, EntryType.INCOME);
    const prevExpense = sumBy(prev as any, EntryType.EXPENSE);
    const openingBalance = prevIncome - prevExpense;
    const closingBalance = openingBalance + net;

    return { month, openingBalance, income, expense, net, closingBalance };
}
