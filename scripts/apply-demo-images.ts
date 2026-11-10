// Applies scripts/demo-images.json (product slug -> list of https image links) to the database.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

const force = process.argv.includes("--force");
async function main() {
  const map = JSON.parse(readFileSync(new URL("./demo-images.json", import.meta.url), "utf8")) as Record<string, unknown>;
  let changed = 0, skipped = 0;
  for (const [slug, v] of Object.entries(map)) {
    if (slug.startsWith("_") || !Array.isArray(v) || !v.length) continue;
    const urls = v.filter((u): u is string => typeof u === "string" && /^https:\/\//i.test(u)); // https only, no javascript:/data:
    if (!urls.length) { console.warn("skip (no valid https links):", slug); continue; }
    const [p] = await db.select().from(schema.products).where(eq(schema.products.slug, slug));
    if (!p) { console.warn("no such product:", slug); continue; }
    if (p.images.length && !force) { skipped++; continue; }
    await db.update(schema.products).set({ images: urls }).where(eq(schema.products.id, p.id)); changed++;
  }
  console.log(`Photos set on ${changed} product(s); ${skipped} already had photos (use --force to replace).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
