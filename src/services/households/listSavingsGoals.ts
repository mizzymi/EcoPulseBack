import { prisma } from "../../db/prisma";
import { SavingsTxnType } from "@prisma/client";
import { assertMember } from "./guards";

/**
 * Lists savings goals with computed progress (member).
 */
export async function listSavingsGoals(userId: string, householdId: string) {
    await assertMember(userId, householdId);

    const goals = await prisma.savingsGoal.findMany({
        where: { householdId },
        orderBy: { createdAt: "desc" },
    });

    const sums = await prisma.savingsTxn.groupBy({
        by: ["goalId", "type"],
        where: { goalId: { in: goals.map((g) => g.id) } },
        _sum: { amount: true },
    });

    const map: Record<string, { deposit: number; withdraw: number }> = {};
    for (const s of sums as any) {
        const g = (map[s.goalId] ||= { deposit: 0, withdraw: 0 });
        const val = Number(s._sum.amount ?? 0);
        if (s.type === SavingsTxnType.DEPOSIT) g.deposit += val;
        else g.withdraw += val;
    }

    return goals.map((g: any) => {
        const agg = map[g.id] || { deposit: 0, withdraw: 0 };
        const saved = agg.deposit - agg.withdraw;
        const pct = Math.max(0, Math.min(100, (saved / Number(g.target)) * 100));
        return { ...g, saved, progress: Number.isFinite(pct) ? pct : 0 };
    });
}
