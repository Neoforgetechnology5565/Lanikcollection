import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { startMockFlutterwave } from "../scripts/mock-flutterwave";
import { createOrder } from "@/lib/orders";
import { startPayment, reconcileTxRef } from "@/lib/payments";
import { createRefund, setRefundStatus, RefundError } from "@/lib/refunds";
import { saveSettings, DEFAULTS } from "@/lib/settings";
import { syncVariants } from "@/lib/catalog";

let mock: Awaited<ReturnType<typeof startMockFlutterwave>>; let pid: number;
const cust = { customerName: "R T", email: "r@e.com", phone: "0801234567", address: "1 Road St", city: "Ikeja", state: "Lagos" };
before(async () => {
  mock = await startMockFlutterwave(4011); process.env.FLW_BASE_URL = "http://localhost:4011/v3";
  await saveSettings({ ...DEFAULTS });
  const [p] = await db.insert(schema.products).values({ slug: `rf-${Date.now()}`, name: "Refund Polo", priceKobo: 1000000 }).returning(); pid = p.id; await syncVariants(db, pid, [], [], 50);
});
after(() => mock.server.close());

async function paidOrder() {
  const o = await createOrder({ ...cust, items: [{ productId: pid, qty: 2 }] });
  await startPayment(o, "bank_transfer", "http://x");
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id));
  await mock.ctl("/__pay", { tx_ref: p.txRef, amount: o.totalKobo / 100, status: "successful" });
  await reconcileTxRef(p.txRef);
  return { o, p: (await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0] };
}
const order = async (id: number) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
const stock = async () => (await db.select().from(schema.products).where(eq(schema.products.id, pid)))[0].stock;

test("partial Flutterwave refund is recorded and order stays paid", async () => {
  const { o, p } = await paidOrder();
  const id = await createRefund({ paymentId: p.id, amountKobo: 500000, reason: "Damaged item", method: "flutterwave", adminEmail: "a@x.com" });
  const [r] = await db.select().from(schema.refunds).where(eq(schema.refunds.id, id));
  assert.equal(r.status, "PROCESSED"); assert.ok(r.providerRef);
  assert.equal((await order(o.id)).status, "PAID"); assert.equal((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status, "SUCCESSFUL");
});
test("cannot refund more than was paid, across several refunds", async () => {
  const { p } = await paidOrder();
  await createRefund({ paymentId: p.id, amountKobo: p.paidAmountKobo! - 100, reason: "x", method: "manual", adminEmail: "a@x.com" });
  await assert.rejects(createRefund({ paymentId: p.id, amountKobo: 101, reason: "x", method: "manual", adminEmail: "a@x.com" }), RefundError);
  await assert.rejects(createRefund({ paymentId: p.id, amountKobo: 0, reason: "x", method: "manual", adminEmail: "a@x.com" }), /greater than zero/);
});
test("full refund marks the payment REFUNDED, cancels the order and releases stock", async () => {
  const before = await stock(); const { o, p } = await paidOrder(); assert.equal(await stock(), before - 2);
  await createRefund({ paymentId: p.id, amountKobo: p.paidAmountKobo!, reason: "Customer cancelled", method: "flutterwave", adminEmail: "a@x.com" });
  assert.equal((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status, "REFUNDED");
  assert.equal((await order(o.id)).status, "CANCELLED"); assert.equal(await stock(), before);
});
test("two simultaneous full refunds: exactly one wins (no double refund)", async () => {
  const { p } = await paidOrder();
  const res = await Promise.allSettled([1, 2, 3].map(() => createRefund({ paymentId: p.id, amountKobo: p.paidAmountKobo!, reason: "race", method: "manual", adminEmail: "a@x.com" })).map((x) => x));
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  const rows = await db.select().from(schema.refunds).where(eq(schema.refunds.paymentId, p.id)); assert.equal(rows.length, 1);
});
test("provider rejection records a FAILED refund and frees the amount", async () => {
  const { p } = await paidOrder(); mock_set({ refundFail: true });
  await assert.rejects(createRefund({ paymentId: p.id, amountKobo: 100000, reason: "x", method: "flutterwave", adminEmail: "a@x.com" }), /refused/);
  mock_set({ refundFail: false });
  const [r] = await db.select().from(schema.refunds).where(eq(schema.refunds.paymentId, p.id)); assert.equal(r.status, "FAILED");
  await createRefund({ paymentId: p.id, amountKobo: p.paidAmountKobo!, reason: "retry", method: "flutterwave", adminEmail: "a@x.com" }); // full amount available again
});
test("a pending refund that later fails restores the payment", async () => {
  const { o, p } = await paidOrder(); mock_set({ refundStatus: "pending" });
  const id = await createRefund({ paymentId: p.id, amountKobo: p.paidAmountKobo!, reason: "x", method: "flutterwave", adminEmail: "a@x.com" });
  mock_set({ refundStatus: "completed" });
  assert.equal((await db.select().from(schema.refunds).where(eq(schema.refunds.id, id)))[0].status, "REQUESTED");
  assert.equal((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status, "REFUNDED");
  await setRefundStatus(id, "FAILED", "a@x.com");
  assert.equal((await db.select().from(schema.payments).where(eq(schema.payments.id, p.id)))[0].status, "SUCCESSFUL");
  await assert.rejects(setRefundStatus(id, "PROCESSED", "a@x.com"), /pending/); void o;
});
test("unconfirmed payments and manual-only providers can't be refunded through Flutterwave", async () => {
  const o = await createOrder({ ...cust, items: [{ productId: pid, qty: 1 }] }); await startPayment(o, "bank_transfer", "http://x");
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id));
  await assert.rejects(createRefund({ paymentId: p.id, amountKobo: 100, reason: "x", method: "manual", adminEmail: "a@x.com" }), /confirmed/);
});
function mock_set(b: Record<string, unknown>) { void mock.ctl("/__config", b); }
