import test, { before } from "node:test";
import assert from "node:assert/strict";
import { db, schema } from "@/db";
import { priceCart, createOrder } from "@/lib/orders";
import { saveSettings, DEFAULTS } from "@/lib/settings";
import { syncVariants } from "@/lib/catalog";

let pid: number; let noSize: number;
const sfx = Math.random().toString(36).slice(2, 7);
before(async () => {
  await saveSettings({ ...DEFAULTS, shippingFlatKobo: 250000 });
  const [p] = await db.insert(schema.products).values({ slug: `pr-${sfx}`, name: "Price Test Polo", priceKobo: 1000000, saleKobo: 900000, wholesaleKobo: 700000, wholesaleMin: 6, sizes: ["M", "L"], colors: ["Black"], stock: 50 }).returning();
  const [q] = await db.insert(schema.products).values({ slug: `pn-${sfx}`, name: "No-size item", priceKobo: 500000, stock: 50 }).returning();
  pid = p.id; noSize = q.id;
  await syncVariants(db, p.id, ["M", "L"], ["Black"], 50); await syncVariants(db, q.id, [], [], 50);
  await db.insert(schema.discountCodes).values({ code: `T${sfx.toUpperCase()}`, percent: 10 }).onConflictDoNothing();
  await db.insert(schema.shippingZones).values({ state: "Lagos", feeKobo: 150000 }).onConflictDoUpdate({ target: schema.shippingZones.state, set: { feeKobo: 150000 } });
});
const line = (qty: number) => ({ productId: pid, size: "M", color: "Black", qty });

test("sale price applies, flat shipping by default", async () => {
  const q = await priceCart({ items: [line(1)] });
  assert.equal(q.subtotalKobo, 900000); assert.equal(q.shippingKobo, 250000); assert.equal(q.totalKobo, 1150000);
});
test("wholesale tier kicks in at the minimum quantity (across sizes)", async () => {
  const q = await priceCart({ items: [line(3), { ...line(3), size: "L" }] });
  assert.equal(q.lines[0].unitKobo, 700000); assert.equal(q.subtotalKobo, 6 * 700000);
});
test("state shipping zone overrides the flat fee", async () => {
  assert.equal((await priceCart({ items: [line(1)], state: "Lagos" })).shippingKobo, 150000);
  assert.equal((await priceCart({ items: [line(1)], state: "Kano" })).shippingKobo, 250000);
});
test("discount code takes % off the subtotal; bad codes are rejected", async () => {
  const q = await priceCart({ items: [line(1)], discountCode: `t${sfx}` });
  assert.equal(q.discountKobo, 90000);
  await assert.rejects(priceCart({ items: [line(1)], discountCode: "NOPE" }), /not valid/);
});
test("size/colour are required and validated; client price is never used", async () => {
  await assert.rejects(priceCart({ items: [{ productId: pid, qty: 1 }] }), /size/i);
  await assert.rejects(priceCart({ items: [{ productId: pid, size: "XXL", color: "Black", qty: 1 }] }), /size/i);
  const q = await priceCart({ items: [{ productId: noSize, qty: 2, ...({ priceKobo: 1 } as object) }] });
  assert.equal(q.subtotalKobo, 1000000);
});
test("createOrder stores the server-computed totals", async () => {
  const o = await createOrder({ customerName: "T", email: "t@e.com", phone: "0801234567", address: "1 Road St", city: "Ikeja", state: "Lagos", items: [line(1)] });
  assert.equal(o.totalKobo, 900000 + 150000);
});
