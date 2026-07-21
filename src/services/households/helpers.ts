import { createHash, randomBytes } from "crypto";
import { badRequest } from "../../utils/httpError";
import { EntryType, MoneyType } from "@prisma/client";

export type EntryKind = EntryType;

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function makeHumanCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export function parseMonthStrict(ym?: string) {
  if (!ym) return null;
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}

export function monthRangeUtc(ym: string) {
  const mm = parseMonthStrict(ym);
  if (!mm) throw badRequest("month debe ser YYYY-MM");
  const from = new Date(Date.UTC(mm.y, mm.m - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(mm.y, mm.m, 0, 23, 59, 59, 999));
  return { from, to, ...mm };
}

export function coercePositiveAmount(val: number | string | undefined) {
  const n = typeof val === "string" ? Number(val) : val;
  if (!Number.isFinite(n) || (n as number) <= 0) throw badRequest("amount > 0");
  return n as number;
}

export function coerceType(t?: string): EntryKind {
  const U = (t || "").toUpperCase();
  if (U !== "INCOME" && U !== "EXPENSE") throw badRequest("type debe ser INCOME o EXPENSE");
  return U as EntryKind;
}

export function coerceMoneyType(input: unknown): MoneyType {
  const U = String(input ?? "").toUpperCase();
  if (U === "CASH") return MoneyType.CASH;
  if (U === "CARD") return MoneyType.CARD;
  if (U === "BANK") return MoneyType.BANK;
  return MoneyType.CASH;
}

export function daysInMonth(y: number, m1to12: number) {
  return new Date(Date.UTC(y, m1to12, 0)).getUTCDate();
}

export function parseByMonthDay(rrule?: string): number | null {
  if (!rrule) return null;
  const m = /BYMONTHDAY\s*=\s*(-?\d+)/i.exec(rrule);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return Math.trunc(v);
}
