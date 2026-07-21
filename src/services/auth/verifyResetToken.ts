import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";
import { timingSafeEqual } from "crypto";
import { signWithHmac } from "./signWithHmac";

/**
 * Verifies a password reset token and returns the corresponding user if valid.
 *
 * Purpose:
 * - Validates the structure, signature, and expiration of a reset token.
 * - Ensures the token belongs to an existing user.
 * - Automatically invalidates old tokens after a password change (because the token signature is tied to `passwordHash`).
 *
 * Token format:
 * - `${userId}.${timestamp}.${signature}`
 *
 * How it works:
 * 1) Split token into 3 parts.
 * 2) Validate userId + timestamp.
 * 3) Load the user from the database by id.
 * 4) Validate expiration using `RESET_WINDOW_MINUTES`.
 * 5) Recompute the expected signature using:
 *    - userId + timestamp payload
 *    - user's current passwordHash
 *    - RESET_PEPPER (extra secret)
 *    - RESET_SECRET (HMAC key)
 * 6) Compare expected signature with the token signature.
 *
 * Notes:
 * - This is NOT encryption. It is signature verification.
 * - `RESET_SECRET` and `RESET_PEPPER` must be strong secrets in production.
 * - Do not reveal different error details to the client if you want to avoid leaking information.
 *
 * @param token With this Property we need to pass the reset token string received from the user.
 * @returns With this method we can get the full user record if the token is valid.
 * @throws Throws `badRequest` if the token is invalid or expired.
 */
export async function verifyResetToken(token: string) {
    const parts = (token ?? "").split(".");
    if (parts.length !== 3) throw badRequest("Token inválido");

    const [userId, tsStr, sig] = parts;
    const ts = Number(tsStr);

    if (!userId || !Number.isFinite(ts)) throw badRequest("Token inválido");

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, emailHash: true, passwordHash: true, createdAt: true },
    });
    if (!user) throw badRequest("Token inválido");

    const windowMs = Number(process.env.RESET_WINDOW_MINUTES || "30") * 60_000;
    const age = Date.now() - ts;
    if (age < 0 || age > windowMs) throw badRequest("Token expirado");

    const secret = process.env.RESET_SECRET;
    const pepper = process.env.RESET_PEPPER;
    if (!secret || !pepper) throw new Error("RESET_SECRET and RESET_PEPPER must be set");

    const payload = `${userId}.${tsStr}`;
    const expected = signWithHmac(`${payload}|${user.passwordHash}|${pepper}`, secret);

    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(sig);
    if (expectedBuffer.length !== signatureBuffer.length ||
        !timingSafeEqual(expectedBuffer, signatureBuffer)) {
        throw badRequest("Token inválido");
    }

    return user;
}