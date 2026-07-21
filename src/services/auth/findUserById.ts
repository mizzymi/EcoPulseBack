import { prisma } from "../../db/prisma";

/**
 * Retrieves a user by their unique identifier (ID).
 *
 * Purpose:
 * - Fetches the minimal public user information needed by the app (no password hash).
 * - Useful for authenticated endpoints where you already have the userId (e.g., from a JWT `sub`).
 *
 * Notes:
 * - This method returns `null` if the user does not exist.
 * - We intentionally select only safe fields (id, emailHash, createdAt).
 *
 * @param userId With this Property we need to pass the user id we want to search in the database.
 * @returns With this method we can get the user basic information or `null` if not found.
 */
export async function findUserById(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, emailHash: true, username: true, createdAt: true },
    });
}
