// Runs on every deploy (see "vercel-build"). Seeds demo data + the first admin ONLY when no admin exists yet,
// so redeploying never resets passwords or settings.
import { and, count, eq, isNull } from "drizzle-orm";
import { DEFAULT_GROUPS } from "../src/lib/menu";
import { db, schema } from "../src/db";

async function main() {
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
