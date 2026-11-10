// Runs on every deploy (see "vercel-build"). Seeds demo data + the first admin ONLY when no admin exists yet,
// so redeploying never resets passwords or settings.
import { count } from "drizzle-orm";
import { db, schema } from "../src/db";

async function main() {
  const [a] = await db.select({ n: count() }).from(schema.admins);
  if (a.n > 0) { console.log("setup: admin exists, skipping seed"); process.exit(0); }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.error("setup: no admin yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) in the environment and redeploy.");
    process.exit(1);
  }
  await import("./seed"); // seed.ts creates categories, demo products, settings and the admin, then exits
}
main().catch((e) => { console.error(e); process.exit(1); });
