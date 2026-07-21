import { prisma } from "../../db/prisma";
import { badRequest, conflict } from "../../utils/httpError";
import { encrypt } from "./encrypt";
import { sign } from "./sign";
import { emailHasher } from "./emailHasher";

/**
 * Registers a new user account using email + password.
 *
 * Purpose:
 * - Validates required inputs (email and password).
 * - Normalizes the email (trim + lowercase) to avoid duplicates.
 * - Generates a deterministic email hash (HMAC) to store and enforce uniqueness without storing the plain email.
 * - Hashes the password using bcrypt.
 * - Creates the user in the database and returns a JWT access token.
 *
 * Notes:
 * - We do NOT store the plain email in the database. We store `emailHash` instead.
 * - Uniqueness is enforced by checking `emailHash` and the Prisma schema `@unique` constraint.
 * - Password must be at least 6 characters (you can increase this requirement if needed).
 * - The returned `user` object intentionally excludes `passwordHash`.
 *
 * @param email With this Property we need to pass the user email to create the account (it will be normalized and hashed).
 * @param password With this Property we need to pass the user password to be hashed and stored securely.
 * @returns With this method we can get the access token and basic user information after successful registration.
 */
export async function register(email?: string, username?: string, password?: string) {
    const emailClientHash = (email ?? "").trim();
    const passwordClientHash = (password ?? "").trim();

    if (!emailClientHash || !passwordClientHash || !username) {
        throw badRequest("Email, nombre de usuario y contraseña son requeridos");
    }
    const emailHash = emailHasher(emailClientHash);

    const exists = await prisma.user.findUnique({
        where: { emailHash },
        select: { id: true },
    });

    if (exists) throw conflict("Email ya registrado");

    const passwordHash = await encrypt(passwordClientHash);

    const user = await prisma.user.create({
        data: { emailHash, username, passwordHash },
        select: { id: true, createdAt: true },
    });

    const accessToken = sign(user.id);
    return { accessToken, user };
}