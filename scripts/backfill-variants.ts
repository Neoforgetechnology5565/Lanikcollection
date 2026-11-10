// One-off for databases created before per-variant stock: builds variant rows from each product's
// size/colour lists, splitting the old product-level stock evenly. Safe to re-run (existing variants are kept).
import { db, schema } from "../src/db";
import { syncVariants, combos } from "../src/lib/catalog";
async function main() {
  const rows = await db.select().from(schema.products);
  for (const p of rows) {
    const [any] = await db.select().from(schema.productVariants).limit(1);
    void any;
    await syncVariants(db, p.id, p.sizes, p.colors, Math.floor(p.stock / combos(p.sizes, p.colors).length));
  }
  console.log("Backfilled", rows.length, "products");
  process.exit(0);
}
main();
