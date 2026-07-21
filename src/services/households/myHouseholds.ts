import { prisma } from "../../db/prisma";

/**
 * Lists households the user belongs to.
 */
export async function myHouseholds(userId: string) {
    const ms = await prisma.householdMember.findMany({
        where: { userId },
        include: {
            household: {
                select: {
                    id: true,
                    name: true,
                    currency: true,
                    _count: { select: { members: true } },
                },
            },
        },
        orderBy: { joinedAt: "desc" },
    });

    return ms.map((m) => ({
        id: m.household.id,
        name: m.household.name,
        currency: m.household.currency,
        role: m.role,
        joinedAt: m.joinedAt,
        memberCount: m.household._count.members,
    }));
}
