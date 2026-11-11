"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { createAdminSession, requireAdmin } from "@/lib/session";
import { decryptSecret, encryptSecret, hashCode, newRecoveryCodes, newSecret, verifyTotp } from "@/lib/totp";
import { limited } from "@/lib/ratelimit";

export type State = { ok?: boolean; error?: string; codes?: string[]; message?: string } | null;
const audit = (actor: string, action: string) => db.insert(schema.auditLog).values({ actor, action, detail: "admin account" });

export async function changePassword(_: State, fd: FormData): Promise<State> {
  const me = await requireAdmin();
  if (await limited(`admin-chpw:${me.id}`, 6, 3600)) return { error: "Too many attempts. Try again later." };
  const cur = String(fd.get("current") ?? ""), next = String(fd.get("next") ?? ""), again = String(fd.get("again") ?? "");
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.id, me.id));
  if (!a || !(await bcrypt.compare(cur, a.passwordHash))) return { error: "Your current password is wrong." };
  if (next.length < 10) return { error: "The new password must be at least 10 characters." };
  if (next !== again) return { error: "The two new passwords don't match." };
  if (next === cur) return { error: "Choose a password you haven't used here before." };
  // bumping tokenVersion signs out every other browser; this one is re-issued below
  const [u] = await db.update(schema.admins).set({ passwordHash: await bcrypt.hash(next, 12), tokenVersion: sql`${schema.admins.tokenVersion} + 1` }).where(eq(schema.admins.id, me.id)).returning();
  await createAdminSession(u.email, u.tokenVersion); await audit(me.email, "admin.password.change");
  return { ok: true, message: "Password changed. Every other signed-in browser was signed out." };
}

/** Step 1: make a secret (stored encrypted, NOT yet active). */
export async function startTwoFactor() {
  const me = await requireAdmin();
  await db.update(schema.admins).set({ totpSecretEnc: encryptSecret(newSecret()), totpEnabled: false }).where(eq(schema.admins.id, me.id));
  revalidatePath("/admin/account");
}
/** Step 2: the admin proves their app works by typing a code; only then is 2FA switched on. */
export async function confirmTwoFactor(_: State, fd: FormData): Promise<State> {
  const me = await requireAdmin();
  if (await limited(`admin-2fa-setup:${me.id}`, 10, 900)) return { error: "Too many attempts. Wait a few minutes." };
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.id, me.id));
  if (!a?.totpSecretEnc || a.totpEnabled) return { error: "Start the setup again." };
  const step = verifyTotp(decryptSecret(a.totpSecretEnc), String(fd.get("code") ?? ""), 0);
  if (step == null) return { error: "That code didn't match. Check your phone's clock and try the next code." };
  const { plain, hashes } = newRecoveryCodes();
  await db.update(schema.admins).set({ totpEnabled: true, totpLastStep: step, recoveryHashes: hashes }).where(eq(schema.admins.id, me.id));
  // NOTE: no revalidatePath here on purpose. Refreshing the page would unmount this form and the one-time recovery codes would vanish.
  await audit(me.email, "admin.2fa.enable");
  return { ok: true, codes: plain, message: "Two-step login is on. Save these recovery codes now; they are shown only once, and this page will not show them again." };
}
export async function regenerateCodes(_: State, fd: FormData): Promise<State> {
  const me = await requireAdmin();
  if (await limited(`admin-2fa-regen:${me.id}`, 10, 900)) return { error: "Too many attempts." };
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.id, me.id));
  if (!a?.totpEnabled || !a.totpSecretEnc) return { error: "Two-step login isn't on." };
  const step = verifyTotp(decryptSecret(a.totpSecretEnc), String(fd.get("code") ?? ""), a.totpLastStep);
  if (step == null) return { error: "That code didn't match." };
  const { plain, hashes } = newRecoveryCodes();
  await db.update(schema.admins).set({ recoveryHashes: hashes, totpLastStep: step }).where(eq(schema.admins.id, me.id));
  await audit(me.email, "admin.2fa.recovery"); return { ok: true, codes: plain, message: "New recovery codes. The old ones no longer work." };
}
export async function disableTwoFactor(_: State, fd: FormData): Promise<State> {
  const me = await requireAdmin();
  if (await limited(`admin-2fa-off:${me.id}`, 6, 900)) return { error: "Too many attempts." };
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.id, me.id));
  if (!a || !(await bcrypt.compare(String(fd.get("password") ?? ""), a.passwordHash))) return { error: "Your password is wrong." };
  if (a.totpEnabled && a.totpSecretEnc && verifyTotp(decryptSecret(a.totpSecretEnc), String(fd.get("code") ?? ""), a.totpLastStep) == null) return { error: "That code didn't match." };
  await db.update(schema.admins).set({ totpEnabled: false, totpSecretEnc: null, recoveryHashes: [], totpLastStep: 0 }).where(eq(schema.admins.id, me.id));
  await audit(me.email, "admin.2fa.disable"); revalidatePath("/admin/account");
  return { ok: true, message: "Two-step login is off." };
}
void hashCode;
