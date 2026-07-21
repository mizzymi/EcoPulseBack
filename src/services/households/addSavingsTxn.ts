import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { EntryType, MoneyType, SavingsTxnType } from "@prisma/client";
import { badRequest, notFound } from "../../utils/httpError";
import { assertMember } from "./guards";
import { coercePositiveAmount } from "./helpers";

/**
 * Adds a savings transaction (member).
 * Optionally creates a matching LedgerEntry for DEPOSIT.
 */
export async function addSavingsTxn(
    userId: string,
    householdId: string,
    goalId: string,
    dto: { type: "DEPOSIT" | "WITHDRAW"; amount: number | string; note?: string; occursAt?: string | Date },
) {
    await assertMember(userId, householdId);

    const goal = await prisma.savingsGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.householdId !== householdId) throw notFound("Meta no encontrada");

    const t = (dto.type || "").toUpperCase();
    if (t !== "DEPOSIT" && t !== "WITHDRAW") throw badRequest("type inválido");

    const amt = coercePositiveAmount(dto.amount);
    const when = dto.occursAt ? new Date(dto.occursAt) : new Date();
    const cleanNote = dto.note?.trim() || null;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const savedTxn = await tx.savingsTxn.create({
            data: {
                goalId,
                userId,
                type: t === "DEPOSIT" ? SavingsTxnType.DEPOSIT : SavingsTxnType.WITHDRAW,
                amount: amt,
                note: cleanNote,
                occursAt: when,
            },
        });

        return savedTxn;
    });
}
