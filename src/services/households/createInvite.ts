import { prisma } from "../../db/prisma";
import { badRequest } from "../../utils/httpError";
import { assertAdmin } from "./guards";
import { makeHumanCode, sha256 } from "./helpers";
import { strongSecret } from "../../config";

export async function createInvite(
    userId: string,
    householdId: string,
    opts: { expiresInHours?: number; maxUses?: number; requireApproval?: boolean },
) {
    await assertAdmin(userId, householdId);

    const expiresInHours = opts.expiresInHours ?? 48;
    const maxUses = opts.maxUses ?? 10;
    const requireApproval = opts.requireApproval ?? true;

    if (expiresInHours < 1 || expiresInHours > 720) throw badRequest("expiresInHours entre 1–720");
    if (maxUses < 1 || maxUses > 999) throw badRequest("maxUses entre 1–999");

    const code = makeHumanCode(8);
    const codeHash = sha256(code + strongSecret("INVITE_PEPPER"));
    const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

    await prisma.householdInvite.create({
        data: { householdId, codeHash, expiresAt, maxUses, requireApproval, createdBy: userId },
    });

    return { code, expiresAt, maxUses, requireApproval };
}
