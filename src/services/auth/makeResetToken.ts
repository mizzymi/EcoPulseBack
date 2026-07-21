import { signWithHmac } from "./signWithHmac";

/**
 * Generates a password reset token tied to the user and their current password hash.
 *
 * Purpose:
 * - Creates a reset token that can be verified later without storing it in the database.
 * - Makes the token invalid automatically if the user changes their password (because it includes `passwordHash`).
 *
 * Token format:
 * - `${userId}.${timestamp}.${signature}`
 *
 * How it works:
 * - We build a payload with the user id and the current timestamp.
 * - We sign a string that includes:
 *   - payload (userId + timestamp)
 *   - current passwordHash (so changing password invalidates old tokens)
 *   - a "pepper" (extra server-side secret)
 * - The signature is created with HMAC-SHA256 using `RESET_SECRET`.
 *
 * Notes:
 * - This is NOT encryption. It is a signed token.
 * - `RESET_SECRET` should be a long random value in production.
 * - `RESET_PEPPER` should also be secret and not shared with clients.
 * - The timestamp can be used by your verifier to enforce expiration (recommended).
 *
 * @param userId With this Property we need to pass the user id for which we are generating the reset token.
 * @param passwordHash With this Property we need to pass the user's current password hash to bind the token to the current password state.
 * @returns With this method we can get the reset token string.
 */
export function makeResetToken(userId: string, passwordHash: string) {
    const ts = Date.now().toString();
    const secret = process.env.RESET_SECRET;
    const pepper = process.env.RESET_PEPPER;
    if (!secret || !pepper) throw new Error("RESET_SECRET and RESET_PEPPER must be set");

    const payload = `${userId}.${ts}`;
    const sig = signWithHmac(`${payload}|${passwordHash}|${pepper}`, secret);

    return `${userId}.${ts}.${sig}`;
}
