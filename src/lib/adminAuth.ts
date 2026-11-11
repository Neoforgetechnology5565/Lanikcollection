import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret, hashCode, verifyTotp } from "./totp";

/**
 * Check the second login factor for an admin: a 6-digit authenticator code (each code usable once) or
 * one of the one-time recovery codes. Returns true on success and records the use atomically.
 */
export async function verifySecondFactor(email: string, input: string): Promise<boolean> {
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.email, email));
  if (!a || !a.totpEnabled || !a.totpSecretEnc) return false;
  const typed = input.trim();
  if (/^\d{3}\s?\d{3}$/.test(typed)) {
    const step = verifyTotp(decryptSecret(a.totpSecretEnc), typed, a.totpLastStep);
    if (step == null) return false;
    // WHERE guard makes two simultaneous submissions of the same code succeed only once
    const r = await db.update(schema.admins).set({ totpLastStep: step }).where(and(eq(schema.admins.id, a.id), sql`${schema.admins.totpLastStep} < ${step}`)).returning({ id: schema.admins.id });
    return r.length === 1;
  }
  const h = hashCode(typed);
  if (!/^[a-f0-9]{10}$/i.test(typed.replace(/[\s-]/g, ""))) return false;
  const r = await db.update(schema.admins).set({ recoveryHashes: sql`array_remove(${schema.admins.recoveryHashes}, ${h})` })
    .where(and(eq(schema.admins.id, a.id), sql`${h} = ANY(${schema.admins.recoveryHashes})`)).returning({ id: schema.admins.id });
  return r.length === 1;
}
