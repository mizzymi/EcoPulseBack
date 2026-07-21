import crypto from "crypto";
import { emailHasher } from "../services";

/**
 * Normalizes an email so hashing is stable across devices.
 */
export function normalizeEmail(email: string): string {
    return (email ?? "").trim().toLowerCase();
}

/**
 * SHA-256 hex (same output format as your frontend sha256Hex()).
 */
export function sha256HexSync(input: string): string {
    return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Computes the DB lookup hash from either:
 * - a client-provided SHA256(email) hex, OR
 * - a raw email string (server computes SHA256)
 *
 * DB hash contract (compatible with "register sends sha256"):
 *   emailHashDB = HMAC( SHA256(normalizedEmail) )
 */
export function computeEmailHashFromAny(input: { email?: string; emailClientHash?: string }): string {
    const clientHash =
        (input.emailClientHash ?? "").trim() ||
        sha256HexSync(normalizeEmail(input.email ?? ""));

    if (!clientHash) return "";

    // emailHasher should be deterministic HMAC (no random salt).
    return emailHasher(clientHash);
}
