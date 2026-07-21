import { prisma } from "../db/prisma";
import { badRequest } from "../utils/httpError";

/**
 * Registers (or updates) a device push token for a user.
 *
 * Purpose:
 * - Stores a device token (FCM/APNs/etc.) so the backend can send push notifications.
 * - Ensures the token is unique in the database and linked to the latest user/device state.
 * - Updates `lastSeen` and un-revokes a token when the device registers again.
 *
 * How it works:
 * - Uses Prisma `upsert` with `token` as the unique key:
 *   - If the token already exists: updates userId, platform, revoked=false, and lastSeen.
 *   - If the token does not exist: creates a new record.
 *
 * Notes:
 * - `token` is trimmed and must not be empty.
 * - `platform` is trimmed and must not be empty (e.g., "android" | "ios" | "web").
 * - This function does not validate that `userId` exists; it assumes the caller is authenticated
 *   and has already verified the user identity.
 *
 * @param userId With this Property we need to pass the user id that owns this device token.
 * @param token With this Property we need to pass the device push token to register (must be unique).
 * @param platform With this Property we need to pass the platform name for the device (e.g., android/ios/web).
 * @returns With this method we can get `{ ok: true }` after the token has been stored/updated successfully.
 */
export async function registerDevice(userId: string, token: string, platform: string) {
  const t = (token ?? "").trim();
  const p = (platform ?? "").trim();

  if (!t) throw badRequest("token requerido");
  if (!p) throw badRequest("platform requerido");

  await prisma.deviceToken.upsert({
    where: { token: t },
    update: { userId, platform: p, revoked: false, lastSeen: new Date() },
    create: { userId, token: t, platform: p },
  });

  return { ok: true };
}
``
