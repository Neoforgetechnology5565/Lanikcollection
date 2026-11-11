// Runs on every deploy (see "vercel-build"). Seeds demo data + the first admin ONLY when no admin exists yet,
// so redeploying never resets passwords or settings.
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { DEFAULT_GROUPS } from "../src/lib/menu";
import { db, schema } from "../src/db";

import bcrypt from "bcryptjs";
async function resetAdmin() {
  // Recovery without database access: set ADMIN_RESET_PASSWORD (and optionally ADMIN_RESET_2FA=1) in Vercel for ONE deploy, then remove them.
  const pw = process.env.ADMIN_RESET_PASSWORD, email = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!pw || !email) return;
  if (pw.length < 10) { console.error("setup: ADMIN_RESET_PASSWORD must be 10+ characters"); process.exit(1); }
  const set: Record<string, unknown> = { passwordHash: await bcrypt.hash(pw, 12), tokenVersion: sql`${schema.admins.tokenVersion} + 1` };
  if (process.env.ADMIN_RESET_2FA === "1") Object.assign(set, { totpEnabled: false, totpSecretEnc: null, recoveryHashes: [], totpLastStep: 0 });
  const r = await db.update(schema.admins).set(set).where(eq(schema.admins.email, email)).returning({ id: schema.admins.id });
  console.log(r.length ? `setup: reset password for ${email}${process.env.ADMIN_RESET_2FA === "1" ? " and cleared two-step login" : ""}. REMOVE ADMIN_RESET_PASSWORD now.` : `setup: no admin with email ${email}`);
}

async function main() {
  await resetAdmin();
  // existing shops: give the built-in categories their menu group once (never overwrites an admin's choice)
  for (const [slug, g] of Object.entries(DEFAULT_GROUPS)) await db.update(schema.categories).set({ menuGroup: g }).where(and(eq(schema.categories.slug, slug), isNull(schema.categories.menuGroup)));
  const [a] = await db.select({ n: count() }).from(schema.admins);
  if (a.n > 0) { console.log("setup: admin exists, skipping seed"); process.exit(0); }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error("setup: no admin yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) in the environment and redeploy.");
    process.exit(1);
  }
  await import("./seed"); // seed.ts creates categories, demo products, settings and the admin, then exits
}
main().catch((e) => { console.error(e); process.exit(1); });
