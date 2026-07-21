import { prisma } from "../../db/prisma";
import { badRequest, unauthorized } from "../../utils/httpError";
import { emailHasher } from "./emailHasher";
import { encrypt } from "./encrypt";
import { verifyResetToken } from "./verifyResetToken";

/**
 * Resets the user password using a valid reset token.
 *
 * Notes:
 * - We do not store plain emails in the DB (only emailHash), so we cannot email the user here.
 * - If you want email notifications, store `email` or pass the email in the reset flow.
 */
export async function resetPassword(email: string, token: string, newPassword: string) {
    const emailClientHash = String(email ?? "").trim();
    const passwordClientHash = String(newPassword ?? "").trim();

    if (!emailClientHash) throw badRequest("Email requerido");
    if (!passwordClientHash) throw badRequest("Contraseña requerida");

    const user = await verifyResetToken(token);

    const emailHash = emailHasher(emailClientHash);
    if (!user?.emailHash || user.emailHash !== emailHash) {
        throw unauthorized("Token inválido");
    }
    const passwordHash = await encrypt(passwordClientHash);

    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
    });

    return { ok: true };
}