import test, { before } from "node:test";
import assert from "node:assert/strict";
import { db, schema } from "@/db";
import { buildReport, reportToCsv } from "@/lib/reports";
import { syncVariants } from "@/lib/catalog";

// Far-past dates isolate this test from other tests sharing the DB.
let n = 0;
async function order(opts: { paidAt: string | null; status: any; total: number; state?: string; item?: [number, number, number] }) {
  const [o] = await db.insert(schema.orders).values({ number: `RPT-${Date.now()}-${n++}`, accessToken: "t", status: opts.status, customerName: "R", email: "r@e.com", phone: "08000000000", address: "a b c d", city: "c", state: opts.state ?? "Lagos",
    subtotalKobo: opts.total, totalKobo: opts.total, paidAt: opts.paidAt ? new Date(opts.paidAt) : null, stockReserved: false }).returning();
  return o;
}
let prod: number, cat: number;
before(async () => {
  const [c] = await db.insert(schema.categories).values({ slug: `rc-${Date.now()}`, name: "Report Cat" }).returning(); cat = c.id;
  const [p] = await db.insert(schema.products).values({ slug: `rp-${Date.now()}`, name: "Report Shirt", priceKobo: 500000, categoryId: cat }).returning(); prod = p.id; await syncVariants(db, prod, [], [], 5);
  const a = await order({ paidAt: "2001-03-10T10:00:00Z", status: "PAID", total: 1000000 });
  const b = await order({ paidAt: "2001-03-10T15:00:00Z", status: "DELIVERED", total: 500000, state: "Kano" });
  await order({ paidAt: "2001-03-12T10:00:00Z", status: "CANCELLED", total: 9999999 });          // cancelled: excluded
  await order({ paidAt: null, status: "AWAITING_PAYMENT", total: 7777777 });                     // unpaid: excluded
  await order({ paidAt: "2001-03-31T23:30:00Z", status: "PAID", total: 200000 });                // 00:30 on 1 Apr in Lagos
  for (const [o, qty] of [[a, 2], [b, 1]] as const) await db.insert(schema.orderItems).values({ orderId: o.id, productId: prod, name: "Report Shirt", qty, unitKobo: 500000 });
});

test("revenue, orders and averages count only verified, non-cancelled orders", async () => {
  const r = await buildReport("2001-03-01", "2001-03-31", "day");
  assert.equal(r.orders, 2); assert.equal(r.revenue, 1500000); assert.equal(r.aov, 750000); assert.equal(r.units, 3);
});
test("days are Lagos days: a 23:30 UTC payment belongs to the next day", async () => {
  const mar = await buildReport("2001-03-01", "2001-03-31", "day"); const apr = await buildReport("2001-04-01", "2001-04-01", "day");
  assert.ok(!mar.series.some((s) => s.period === "2001-03-31")); assert.equal(apr.revenue, 200000);
});
test("series, products, categories and states aggregate correctly", async () => {
  const r = await buildReport("2001-03-01", "2001-03-31", "day");
  assert.deepEqual(r.series, [{ period: "2001-03-10", revenue: 1500000, orders: 2 }]);
  assert.equal(r.products[0].units, 3); assert.equal(r.products[0].revenue, 1500000);
  assert.equal(r.categories[0].name, "Report Cat");
  assert.deepEqual(r.states.map((s) => [s.state, s.orders]).sort(), [["Kano", 1], ["Lagos", 1]]);
});
test("monthly grouping and net-of-refunds", async () => {
  const [o] = await db.select().from(schema.orders).limit(1); void o;
  const r = await buildReport("2001-03-01", "2001-04-30", "month");
  assert.deepEqual(r.series.map((s) => s.period), ["2001-03-01", "2001-04-01"]);
  assert.equal(r.net, r.revenue - r.refunded);
});
test("CSV export has the numbers and neutralises formula injection", async () => {
  const r = await buildReport("2001-03-01", "2001-03-31", "day");
  const csv = reportToCsv({ ...r, products: [{ name: "=HYPERLINK(\"x\")", units: 1, revenue: 100 }] });
  assert.match(csv, /"Gross revenue \(NGN\)","15000"/); assert.match(csv, /"'=HYPERLINK/);
});
