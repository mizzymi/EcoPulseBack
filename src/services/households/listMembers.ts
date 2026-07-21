import { prisma } from "../../db/prisma";
import { assertMember } from "./guards";

/**
 * Lists household members.
 * IMPORTANT: User model has NO email, only emailHash.
 *
 * Contract:
 * - myRole: 'OWNER' | 'ADMIN' | 'MEMBER'
 * - members: [{ userId, role, joinedAt (ISO string), user: { id, emailHash, username }, isMe }]
 */
export async function listMembers(userId: string, householdId: string) {
    const me = await assertMember(userId, householdId);

    const members = await prisma.householdMember.findMany({
        where: { householdId },
        include: { user: { select: { id: true, emailHash: true, username: true } } },
        orderBy: { joinedAt: "asc" },
    });

    return {
        myRole: me.role,
        members: members.map((m) => ({
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt.toISOString(),
            user: m.user,
            isMe: m.userId === userId,
        })),
    };
}
