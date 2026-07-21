import { prisma } from "../../db/prisma";
import { assertAdmin } from "./guards";

/**
 * Lists join requests (ADMIN/OWNER).
 * IMPORTANT: User model has NO email, only emailHash.
 */
export async function listJoinRequests(
    userId: string,
    householdId: string,
    status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING",
) {
    await assertAdmin(userId, householdId);

    return prisma.householdJoinRequest.findMany({
        where: { householdId, status },
        include: { user: { select: { id: true, emailHash: true } } },
        orderBy: { createdAt: "desc" },
    });
}
