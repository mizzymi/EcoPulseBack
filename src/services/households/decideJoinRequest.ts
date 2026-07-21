import { prisma } from "../../db/prisma";
import type { Prisma } from "@prisma/client";
import { HouseholdRole } from "@prisma/client";
import { badRequest, notFound } from "../../utils/httpError";
import { assertAdmin } from "./guards";
import { notifications } from "../notifications";

/**
 * Decides a join request (ADMIN/OWNER).
 */
export async function decideJoinRequest(
    adminUserId: string,
    householdId: string,
    reqId: string,
    decision: "APPROVED" | "REJECTED",
) {
    await assertAdmin(adminUserId, householdId);

    const jr = await prisma.householdJoinRequest.findUnique({ where: { id: reqId } });
    if (!jr || jr.householdId !== householdId) throw notFound("Solicitud no encontrada");
    if (jr.status !== "PENDING") throw badRequest("La solicitud ya fue resuelta");

    if (decision === "APPROVED") {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.householdMember.upsert({
                where: { householdId_userId: { householdId, userId: jr.userId } },
                create: { householdId, userId: jr.userId, role: HouseholdRole.MEMBER },
                update: {},
            });

            await tx.householdJoinRequest.update({
                where: { id: reqId },
                data: { status: "APPROVED", decidedAt: new Date(), decidedBy: adminUserId },
            });

            await tx.householdInvite.update({
                where: { id: jr.inviteId },
                data: { uses: { increment: 1 } },
            });
        });
    } else {
        await prisma.householdJoinRequest.update({
            where: { id: reqId },
            data: { status: "REJECTED", decidedAt: new Date(), decidedBy: adminUserId },
        });
    }

    return { ok: true, status: decision };
}
