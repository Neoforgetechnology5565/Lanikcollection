import test, { before } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createOrder } from "@/lib/orders";
import { syncVariants } from "@/lib/catalog";
import { saveSettings, DEFAULTS } from "@/lib/settings";
import { expireDueOrders } from "@/lib/payments";

let pid: number;
const sfx = Math.random().toString(36).slice(2, 7);
const cust = { customerName: "V T", email: "v@e.com", phone: "0801234567", address: "1 Road St", city: "Ikeja", state: "Lagos" };
const stock = async (size: string, color: string) => (await db.select().from(schema.productVariants).where(and(eq(schema.productVariants.productId, pid), eq(schema.productVariants.size, size), eq(schema.productVariants.color, color))))[0].stock;
const total = async () => (await db.select().from(schema.products).where(eq(schema.products.id, pid)))[0].stock;

before(async () => {
  await saveSettings({ ...DEFAULTS });
  const [p] = await db.insert(schema.products).values({ slug: `vr-${sfx}`, name: "Variant Polo", priceKobo: 1000000, sizes: ["M", "L"], colors: ["Black", "White"] }).returning();
  pid = p.id; await syncVariants(db, pid, p.sizes, p.colors, 3);
});

test("one variant per size×colour, product total is the sum", async () => { assert.equal(await total(), 12); });

test("selling out one size/colour does not block the others", async () => {
  const o = await createOrder({ ...cust, items: [{ productId: pid, size: "M", color: "Black", qty: 3 }] });
  assert.equal(await stock("M", "Black"), 0); assert.equal(await stock("L", "Black"), 3); assert.equal(await total(), 9);
  await assert.rejects(createOrder({ ...cust, items: [{ productId: pid, size: "M", color: "Black", qty: 1 }] }), /does not have enough stock/);
  await createOrder({ ...cust, items: [{ productId: pid, size: "L", color: "Black", qty: 1 }] }); // other variant still sells
  assert.equal(await stock("L", "Black"), 2);
  // expiry returns stock to the exact variant it came from
  await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, o.id));
  await expireDueOrders();
  assert.equal(await stock("M", "Black"), 3);
});

test("a failed multi-line order reserves nothing", async () => {
  const before = await total();
  await assert.rejects(createOrder({ ...cust, items: [{ productId: pid, size: "M", color: "White", qty: 1 }, { productId: pid, size: "L", color: "White", qty: 99 }] }));
  assert.equal(await total(), before); assert.equal(await stock("M", "White"), 3);
});

test("changing the option lists keeps stock for existing combos and drops removed ones", async () => {
  await syncVariants(db, pid, ["M", "L", "XL"], ["Black", "White"], 5);
  assert.equal(await stock("XL", "Black"), 5); assert.equal(await stock("M", "White"), 3);
  await syncVariants(db, pid, ["M"], ["Black"], 0);
  const left = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, pid));
  assert.equal(left.length, 1);
});
