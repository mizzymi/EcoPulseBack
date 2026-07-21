import { prisma } from "../../db/prisma";
import { badRequest, unauthorized } from "../../utils/httpError";
import { compare } from "bcryptjs";
import { sign } from "./sign";
import { emailHasher } from "./emailHasher";

/**
 * Authenticates a user using email + password and returns an access token.
 *
 * Purpose:
 * - Validates the provided credentials.
 * - Looks up the user using a deterministic email hash (HMAC) instead of storing the plain email.
 * - Verifies the password using bcrypt compare.
 * - Returns a JWT access token containing the user id (`sub`).
 *
 * Notes:
 * - We normalize the email (trim + lowercase) before hashing to avoid duplicates and mismatches.
 * - We use a generic error message for invalid credentials to avoid leaking whether an email exists.
 * - The query selects only the necessary fields (id, passwordHash, createdAt).
 *
 * @param email With this Property we need to pass the user email used to identify the account.
 * @param password With this Property we need to pass the user password to validate against the stored hash.
 * @returns With this method we can get the access token and basic user info if the credentials are valid.
 */
export async function login(email: string, password: string) {
    const emailClientHash = String(email ?? '').trim();
    const passwordClientHash = String(password ?? '').trim();

    if (!emailClientHash) throw badRequest('Email requerido');
    if (!passwordClientHash) throw badRequest('Contraseña requerida');

    const invalidCreds = () => unauthorized('Correo o contraseña equivocado');

    const emailHash = emailHasher(emailClientHash);

    const user = await prisma.user.findUnique({
        where: { emailHash },
        select: { id: true, passwordHash: true, createdAt: true },
    });

    if (!user) throw invalidCreds();

    const ok = await compare(passwordClientHash, user.passwordHash);
    if (!ok) throw invalidCreds();

    const accessToken = sign(user.id);

    return {
        accessToken,
        user: { id: user.id, createdAt: user.createdAt },
    };
}
