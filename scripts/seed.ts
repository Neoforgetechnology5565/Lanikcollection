import bcrypt from "bcryptjs";
import { db, schema } from "../src/db";
import { DEFAULTS } from "../src/lib/settings";
import { syncVariants, combos } from "../src/lib/catalog";
import { eq } from "drizzle-orm";

const cats = ["Perfumes", "Boxers", "Singlets", "Polo Shirts", "Jeans", "Other Fashion Items"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const N = (n: number) => n * 100;

async function main() {
  for (const [i, name] of cats.entries()) await db.insert(schema.categories).values({ slug: slug(name), name, sort: i }).onConflictDoNothing();
  const all = await db.select().from(schema.categories); const id = (n: string) => all.find((c) => c.name === n)!.id;
  const S = ["S", "M", "L", "XL", "XXL"];
  // Demo data. Replace via Admin → Products (add real photos with image URLs).
  const demo = [
    ["Oud Royale Eau de Parfum 100ml", "Perfumes", 18500, 15000, [], [], 40, true, 14000, 6],
    ["Amber Noir Perfume Oil 50ml", "Perfumes", 12000, null, [], [], 30, true, 9500, 6],
    ["Premium Cotton Boxers (3-pack)", "Boxers", 7500, 6500, S, ["Black", "Navy", "Grey"], 120, true, 5500, 12],
    ["Classic Stretch Boxer Briefs", "Boxers", 3500, null, S, ["Black", "Charcoal"], 150, false, 2500, 12],
    ["Ribbed Cotton Singlet", "Singlets", 3000, null, S, ["White", "Black"], 200, false, 2000, 12],
    ["Sport Fit Singlet (2-pack)", "Singlets", 5000, 4500, S, ["White", "Grey"], 90, false, 3800, 12],
    ["Gold Trim Polo Shirt", "Polo Shirts", 12500, null, S, ["Black", "White", "Navy"], 60, true, 9500, 6],
    ["Pique Cotton Polo", "Polo Shirts", 9500, 8500, S, ["Navy", "Wine", "Olive"], 80, false, 7000, 6],
    ["Slim Fit Stretch Jeans", "Jeans", 22000, null, ["30", "32", "34", "36", "38"], ["Dark Blue", "Black"], 50, true, 17000, 6],
    ["Relaxed Straight Jeans", "Jeans", 20000, 17500, ["30", "32", "34", "36"], ["Light Blue"], 45, false, null, null],
    ["Leather Belt", "Other Fashion Items", 8500, null, [], ["Black", "Brown"], 35, false, null, null],
    ["Fragrance Gift Set", "Other Fashion Items", 28000, 25000, [], [], 20, true, null, null],
  ] as const;
  for (const [name, cat, price, sale, sizes, colors, stock, featured, ws, wsMin] of demo) {
    await db.insert(schema.products).values({
      slug: slug(name), name, description: `${name}: premium quality at an affordable price. Available for wholesale and retail.`,
      categoryId: id(cat), priceKobo: N(price), saleKobo: sale ? N(sale) : null, wholesaleKobo: ws ? N(ws) : null, wholesaleMin: wsMin,
      sizes: [...sizes], colors: [...colors], stock: 0, featured,
    }).onConflictDoNothing();
    const [row] = await db.select().from(schema.products).where(eq(schema.products.slug, slug(name)));
    await syncVariants(db, row.id, [...sizes], [...colors], Math.max(1, Math.floor(stock / combos([...sizes], [...colors]).length)));
  }
  await db.insert(schema.discountCodes).values({ code: "WELCOME10", percent: 10 }).onConflictDoNothing();
  await db.insert(schema.settings).values({ key: "app", value: DEFAULTS }).onConflictDoNothing(); // never overwrite admin config

  const email = process.env.ADMIN_EMAIL, pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 10) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (10+ chars) to create the admin");
  await db.insert(schema.admins).values({ email: email.toLowerCase(), passwordHash: await bcrypt.hash(pw, 12) })
    .onConflictDoUpdate({ target: schema.admins.email, set: { passwordHash: await bcrypt.hash(pw, 12) } });
  console.log("Seeded. Admin:", email);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
