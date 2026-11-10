import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { startMockFlutterwave } from "../scripts/mock-flutterwave";
import { createOrder } from "@/lib/orders";
import { startPayment, reconcileTxRef, expireDueOrders } from "@/lib/payments";
import { saveSettings, DEFAULTS } from "@/lib/settings";
import { syncVariants, setAllStock } from "@/lib/catalog";
import { POST as webhook } from "@/app/api/webhooks/flutterwave/route";

let mock: Awaited<ReturnType<typeof startMockFlutterwave>>;
let pid: number;
const sfx = Math.random().toString(36).slice(2, 8);

const customer = { customerName: "Ada Obi", email: "ada@example.com", phone: "08012345678", address: "12 Marina Road", city: "Lagos", state: "Lagos" };
const stockOf = async () => (await db.select().from(schema.products).where(eq(schema.products.id, pid)))[0].stock;
const hook = (txRef: string, hash = process.env.FLW_SECRET_HASH!, id = 1) =>
  webhook(new Request("http://x/api/webhooks/flutterwave", { method: "POST", headers: { "verif-hash": hash }, body: JSON.stringify({ event: "charge.completed", data: { id, tx_ref: txRef, status: "successful" } }) }));
async function newBankOrder(qty = 1) {
  const o = await createOrder({ ...customer, items: [{ productId: pid, qty }] });
  await startPayment(o, "bank_transfer", "http://localhost:3000");
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id));
  return { o, p };
}
const order = async (id: number) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
const payment = async (id: number) => (await db.select().from(schema.payments).where(eq(schema.payments.id, id)))[0];

before(async () => {
  mock = await startMockFlutterwave(4010);
  await saveSettings({ ...DEFAULTS });
  const [p] = await db.insert(schema.products).values({ slug: `t-${sfx}`, name: "Test Polo", priceKobo: 1500000, stock: 100 }).returning();
  pid = p.id;
  await syncVariants(db, pid, [], [], 100);
});
after(async () => { mock.server.close(); });

test("bank transfer creates a unique virtual account with a 2h window", async () => {
  const { o, p } = await newBankOrder();
  assert.ok(p.vaAccountNumber && p.vaBank);
  assert.equal(p.amountKobo, o.totalKobo);
  const mins = (p.vaExpiresAt!.getTime() - Date.now()) / 60000;
  assert.ok(mins > 118 && mins <= 120, `expiry ${mins}`);
  const second = await newBankOrder();
  assert.notEqual(second.p.vaAccountNumber, p.vaAccountNumber);
});

test("provider's shorter expiry wins over the admin setting", async () => {
  await mock.ctl("/__config", { vaMinutes: 60 });
  const { p } = await newBankOrder();
  await mock.ctl("/__config", { vaMinutes: 180 });
  assert.ok((p.vaExpiresAt!.getTime() - Date.now()) / 60000 <= 60);
});

test("webhook with a bad signature is rejected", async () => {
  const { p } = await newBankOrder();
  assert.equal((await hook(p.txRef, "wrong")).status, 401);
});

test("a webhook (even correctly signed) cannot mark an unpaid order paid", async () => {
  const { o, p } = await newBankOrder();
  const res = await hook(p.txRef); // provider has no such payment
  assert.equal(res.status, 200);
  assert.equal((await order(o.id)).status, "AWAITING_PAYMENT");
  assert.equal((await payment(p.id)).status, "PENDING");
});

test("verified webhook marks the order PAID, and replays are harmless", async () => {
  const { o, p } = await newBankOrder();
  await mock.ctl("/__pay", { tx_ref: p.txRef, amount: o.totalKobo / 100, status: "successful" });
  await hook(p.txRef, undefined, 77); await hook(p.txRef, undefined, 77);
  await Promise.all([reconcileTxRef(p.txRef), reconcileTxRef(p.txRef)]);
  assert.equal((await order(o.id)).status, "PAID");
  const pay = await payment(p.id);
  assert.equal(pay.status, "SUCCESSFUL"); assert.equal(pay.paidAmountKobo, o.totalKobo);
});

test("underpayment goes to REVIEW, never PAID", async () => {
  const { o, p } = await newBankOrder();
  await mock.ctl("/__pay", { tx_ref: p.txRef, amount: o.totalKobo / 100 - 500, status: "successful" });
  await reconcileTxRef(p.txRef);
  assert.equal((await order(o.id)).status, "REVIEW");
  assert.equal((await payment(p.id)).status, "REVIEW");
});

test("unpaid orders expire and release stock", async () => {
  const before = await stockOf();
  const { o } = await newBankOrder(2);
  assert.equal(await stockOf(), before - 2);
  await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, o.id));
  await expireDueOrders();
  assert.equal((await order(o.id)).status, "EXPIRED");
  assert.equal(await stockOf(), before);
});

test("a delayed notification is caught by the pre-expiry verification", async () => {
  const { o, p } = await newBankOrder();
  await mock.ctl("/__pay", { tx_ref: p.txRef, amount: o.totalKobo / 100, status: "successful" }); // no webhook delivered
  await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, o.id));
  const r = await expireDueOrders();
  assert.equal((await order(o.id)).status, "PAID"); assert.ok(r.recovered >= 1);
});

test("late transfer after expiry re-reserves stock and is PAID", async () => {
  const { o, p } = await newBankOrder();
  await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, o.id));
  await expireDueOrders();
  assert.equal((await order(o.id)).status, "EXPIRED");
  await mock.ctl("/__pay", { tx_ref: p.txRef, amount: o.totalKobo / 100, status: "successful" });
  assert.equal(await reconcileTxRef(p.txRef), "late_paid");
  assert.equal((await order(o.id)).status, "PAID");
});

test("late transfer with no stock left goes to REVIEW", async () => {
  const { o, p } = await newBankOrder();
  await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, o.id));
  await expireDueOrders();
  await setAllStock(db, pid, 0);
  await mock.ctl("/__pay", { tx_ref: p.txRef, amount: o.totalKobo / 100, status: "successful" });
  assert.equal(await reconcileTxRef(p.txRef), "review");
  assert.equal((await order(o.id)).status, "REVIEW");
  await setAllStock(db, pid, 50);
});

test("provider outage during expiry leaves the order open instead of expiring it", async () => {
  const { o } = await newBankOrder();
  await db.update(schema.orders).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.orders.id, o.id));
  await mock.ctl("/__config", { down: true });
  const r = await expireDueOrders();
  await mock.ctl("/__config", { down: false });
  assert.equal((await order(o.id)).status, "AWAITING_PAYMENT"); assert.ok(r.skipped >= 1);
});

test("unsupported channel fails gracefully and is recorded", async () => {
  await mock.ctl("/__config", { noChannels: ["opay"] });
  const o = await createOrder({ ...customer, items: [{ productId: pid, qty: 1 }] });
  await assert.rejects(startPayment(o, "opay", "http://localhost:3000"), /unavailable/i);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id));
  assert.equal(p.status, "FAILED"); assert.match(p.failureReason!, /not enabled/);
  await mock.ctl("/__config", { noChannels: [] });
  const r = await startPayment(o, "card", "http://localhost:3000");
  assert.equal(r.kind, "redirect");
});

test("cannot oversell", async () => {
  await setAllStock(db, pid, 1);
  await assert.rejects(createOrder({ ...customer, items: [{ productId: pid, qty: 2 }] }), /enough stock/);
});
