import type { Prisma } from "@prisma/client";
import { HouseholdRole } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { notifications } from "../notifications";
import { badRequest } from "../../utils/httpError";
import { sha256 } from "./helpers";

export async function joinByCode(userId: string, code: string) {
    if (!code?.trim()) throw badRequest("Código requerido");

    const normalized = code.trim().toUpperCase();
    const hash = sha256(normalized + (process.env.INVITE_PEPPER || "pepper"));

    const invite = await prisma.householdInvite.findFirst({
        where: { codeHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!invite) throw badRequest("Código inválido o expirado");
    if (invite.uses >= invite.maxUses) throw badRequest("Este código ya alcanzó su límite de usos");

    const already = await prisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: invite.householdId, userId } },
    });

    if (already) return { status: "APPROVED", householdId: invite.householdId };

    if (invite.requireApproval) {
        const existsPending = await prisma.householdJoinRequest.findFirst({
            where: { householdId: invite.householdId, userId, status: "PENDING" },
        });

        if (!existsPending) {
            await prisma.householdJoinRequest.create({
                data: { householdId: invite.householdId, userId, inviteId: invite.id },
            });
        }

        return { status: "PENDING", householdId: invite.householdId };
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.householdMember.upsert({
            where: { householdId_userId: { householdId: invite.householdId, userId } },
            create: { householdId: invite.householdId, userId, role: HouseholdRole.MEMBER },
            update: {},
        });

        await tx.householdInvite.update({
            where: { id: invite.id },
            data: { uses: { increment: 1 } },
        });
    });

    return { status: "APPROVED", householdId: invite.householdId };
}
