import cron from "node-cron";
import { prisma } from "../db/prisma";
import { daysInMonth, parseByMonthDay, parseMonthStrict } from "../services/households/helpers";
import { utcDayStart } from "../utils/utcDayStart";

export function scheduleAutoPostToday() {
    // Every 15 minutes (robust against restarts / missed schedules)
    cron.schedule("*/15 * * * *", async () => {
        try {
            await runAutoPostTodayOnce();
        } catch (e) {
            console.error("[autopost-today] failed:", e);
        }
    });
}

async function runAutoPostTodayOnce() {
    const now = new Date();

    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const d = now.getUTCDate();

    const month = `${y}-${String(m).padStart(2, "0")}`;
    const dayKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    // Lock key per 15-min window (prevents duplicates across multiple instances)
    const lockKey = `${dayKey}:${String(now.getUTCHours()).padStart(2, "0")}:${Math.floor(now.getUTCMinutes() / 15)}`;

    const gotLock = await tryAcquireLock("autopost-today", lockKey);
    if (!gotLock) return;

    // We create recurring at noon UTC (same as your service)
    const todayOccursAt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    const todayOccursAtDay = utcDayStart(todayOccursAt);
    const tomorrowDay = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));

    // -----------------------------
    // (A) Post Recurring due today
    // -----------------------------
    const recs = await prisma.householdRecurring.findMany({
        where: { active: true },
        select: {
            id: true,
            householdId: true,
            createdBy: true,
            concept: true,
            notes: true,
            type: true,
            amount: true,
            category: true,
            accountType: true,
            dayOfMonth: true,
            rrule: true,
        },
    });

    let recurringCreated = 0;
    let recurringAlready = 0;

    for (const rec of recs) {
        const due = computeOccursAtForMonth(rec, month);
        if (!due) continue;

        // Only if due today (UTC)
        if (
            due.getUTCFullYear() !== todayOccursAt.getUTCFullYear() ||
            due.getUTCMonth() !== todayOccursAt.getUTCMonth() ||
            due.getUTCDate() !== todayOccursAt.getUTCDate()
        ) {
            continue;
        }

        const postingUserId = await pickPostingUserId(rec.householdId, rec.createdBy);

        const result = await postRecurringSystem(rec, postingUserId, todayOccursAt, todayOccursAtDay);
        if (result === "created") recurringCreated++;
        else recurringAlready++;
    }

    // -----------------------------
    // (B) Settle Planned due today
    // -----------------------------
    const plannedDueToday = await prisma.householdPlanned.findMany({
        where: {
            settledAt: null,
            dueDate: {
                gte: todayOccursAtDay,
                lt: tomorrowDay,
            },
        },
        select: {
            id: true,
            householdId: true,
            createdBy: true,
            type: true,
            amount: true,
            category: true,
            notes: true,
            concept: true,
            dueDate: true,
            accountType: true,
        },
    });

    let plannedSettled = 0;

    for (const p of plannedDueToday) {
        const postingUserId = await pickPostingUserId(p.householdId, p.createdBy);
        const ok = await settlePlannedSystem(p, postingUserId);
        if (ok) plannedSettled++;
    }

    if (recurringCreated || recurringAlready || plannedSettled) {
        console.log(
            `[autopost-today] ${dayKey} recurring(created=${recurringCreated}, already=${recurringAlready}) planned(settled=${plannedSettled})`,
        );
    }
}

async function tryAcquireLock(name: string, key: string) {
    try {
        await prisma.jobLock.create({ data: { name, key } });
        return true;
    } catch {
        return false;
    }
}

/**
 * Computes occursAt (noon UTC) for this recurring in the given month.
 * Supports:
 * - BYMONTHDAY in RRULE (parseByMonthDay)
 * - dayOfMonth field
 */
function computeOccursAtForMonth(rec: { dayOfMonth: number | null; rrule: string | null }, month: string) {
    const target = parseMonthStrict(month);
    if (!target) return null;

    const dim = daysInMonth(target.y, target.m);

    let dom: number | null = null;
    const bymd = parseByMonthDay(rec.rrule || undefined);
    if (bymd !== null) dom = bymd;
    else if (typeof rec.dayOfMonth === "number") dom = rec.dayOfMonth;

    if (!dom) return null;

    let day = dom > 0 ? dom : dim + dom + 1;
    day = Math.max(1, Math.min(dim, day));

    return new Date(Date.UTC(target.y, target.m - 1, day, 12, 0, 0, 0));
}

/**
 * Picks a userId to attribute the system-created entry:
 * - Prefer createdBy if still a household member
 * - Else fallback to household OWNER
 * - Else fallback to createdBy anyway
 */
async function pickPostingUserId(householdId: string, preferredUserId: string) {
    const member = await prisma.householdMember.findFirst({
        where: { householdId, userId: preferredUserId },
        select: { userId: true },
    });
    if (member) return preferredUserId;

    const owner = await prisma.householdMember.findFirst({
        where: { householdId, role: "OWNER" },
        select: { userId: true },
    });

    return owner?.userId ?? preferredUserId;
}

/**
 * PRO recurring posting:
 * - First dedupe by (recurringId, occursAtDay)
 * - Legacy fallback by note contains (for old entries)
 * - Then create with recurringId + occursAtDay
 */
async function postRecurringSystem(
    rec: any,
    userId: string,
    occursAt: Date,
    occursAtDay: Date,
): Promise<"created" | "already"> {
    // ✅ PRO dedupe
    const existsPro = await prisma.ledgerEntry.findFirst({
        where: { householdId: rec.householdId, recurringId: rec.id, occursAtDay },
        select: { id: true },
    });
    if (existsPro) return "already";

    // ✅ Legacy fallback
    const canonicalText = `[RECURRING: ${rec.concept}]`;
    const existsLegacy = await prisma.ledgerEntry.findFirst({
        where: { householdId: rec.householdId, occursAtDay, note: { contains: canonicalText } },
        select: { id: true },
    });
    if (existsLegacy) return "already";

    await prisma.ledgerEntry.create({
        data: {
            // OLD columns
            householdId: rec.householdId,
            userId,
            type: rec.type,
            amount: Number(rec.amount),
            category: rec.category,
            note: rec.notes ? `${canonicalText} ${rec.notes}` : canonicalText,
            occursAt,
            accountType: rec.accountType,

            // NEW columns
            occursAtDay,
            recurringId: rec.id,
        },
    });

    return "created";
}

/**
 * Planned settlement system logic:
 * - Uses plannedId unique (PRO) to prevent duplicates
 * - Also marks planned.settledAt
 */
async function settlePlannedSystem(p: any, userId: string): Promise<boolean> {
    // Defensive refresh (avoid race conditions)
    const fresh = await prisma.householdPlanned.findUnique({ where: { id: p.id } });
    if (!fresh || fresh.settledAt) return false;

    const occursAt = p.dueDate as Date;
    const occursAtDay = utcDayStart(occursAt);

    try {
        await prisma.$transaction(async (tx) => {
            await tx.ledgerEntry.create({
                data: {
                    // OLD columns
                    householdId: p.householdId,
                    userId,
                    type: p.type,
                    amount: Number(p.amount),
                    category: p.category,
                    note: p.notes ? `[PLANNED:${p.concept}] ${p.notes}` : `[PLANNED:${p.concept}]`,
                    occursAt,
                    accountType: p.accountType,

                    // NEW columns
                    occursAtDay,
                    plannedId: p.id,
                },
            });

            await tx.householdPlanned.update({
                where: { id: p.id },
                data: { settledAt: new Date() },
            });
        });

        return true;
    } catch (e: any) {
        // If unique plannedId already exists, treat as already settled/created
        return false;
    }
}