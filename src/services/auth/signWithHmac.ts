import { createHmac } from "crypto";

/**
 * Generates an HMAC-SHA256 signature for the given data using a secret key.
 *
 * Purpose:
 * - Ensures integrity: detects if `data` was modified.
 * - Ensures authenticity: only someone with `key` can produce the same signature.
 *
 * Notes:
 * - This is NOT encryption. It is one-way and cannot be reversed to recover `data`.
 * - Output is Base64URL encoded, safe to use in URLs and tokens.
 * 
 * @param data With this Property we need to pass the data we want to check if it was modified or not
 * @param key With this property we need to pass the key to produce the same signature.
 * @returns With this method we can get the hmac sign.
 */
export function signWithHmac(data: string, key: string): string {
    return createHmac('sha256', key)
        .update(data)
        .digest('base64url');
}