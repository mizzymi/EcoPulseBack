import "dotenv/config";
import { prisma } from "../../db/prisma";
import { notifications } from "../notifications";
import { makeResetToken } from "./makeResetToken";
import { normalizeEmail, computeEmailHashFromAny  } from "../../utils/utils";

/**
 * Sends a password reset email to the user (if the account exists).
 *
 * Purpose:
 * - Normalizes the email (trim + lowercase).
 * - Generates a deterministic email hash (HMAC) to find the user without storing the plain email.
 * - If the user exists, generates a signed reset token bound to the current password hash.
 * - Sends a reset link + code to the provided email address.
 *
 * Notes:
 * - This method returns silently if the email is empty or the user is not found (prevents email enumeration).
 * - The email is sent to the address the user typed (`e`) because the database only stores `emailHash`.
 * - `makeResetToken()` ties the token to the current passwordHash, so changing the password invalidates old tokens.
 * - `process.env.HASH` should NOT be used as a base URL. Use something like `APP_URL` instead.
 *
 * @param email With this Property we need to pass the email address where the reset instructions will be sent.
 * @returns With this method we can trigger a password reset email sending flow (no value is returned).
 */
export async function requestPasswordReset(email: string) {
  const e = normalizeEmail(email);
  if (!e) return;

  const emailHash = computeEmailHashFromAny({ email: e });

  const user = await prisma.user.findUnique({
    where: { emailHash },
    select: { id: true, passwordHash: true },
  });

  // Silent return prevents email enumeration
  if (!user) return;

  const token = makeResetToken(user.id, user.passwordHash);

  const baseUrl = process.env.APP_URL_MAIN;
  if (!baseUrl) throw new Error("APP_URL_MAIN not set");

  const link = `${baseUrl}/reset-password?code=${encodeURIComponent(token)}`;

  try {
    await notifications.sendPasswordResetCode(e, token, link);
  } catch (err) {
    console.error("[AUTH] Error sending reset email:", err);
  }
}
