import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { refundTransaction } from "./flutterwave";
import { releaseStock } from "./orders";
import { toNairaNumber } from "./money";

export class RefundError extends Error {}
const COUNTED = ["REQUESTED", "PROCESSED"] as const; // failed refunds don't use up the refundable amount

export async function refundedSoFar(paymentId: number) {
  const [r] = await db.select({ t: sql<string>`coalesce(sum(${schema.refunds.amountKobo}),0)` }).from(schema.refunds)
    .where(and(eq(schema.refunds.paymentId, paymentId), inArray(schema.refunds.status, [...COUNTED])));
  return Number(r.t);
}

/** After any refund change: mark payment REFUNDED when fully refunded; cancel + release stock for an unshipped order. */
async function settle(paymentId: number, adminEmail: string) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update");
    const [done] = await tx.select({ t: sql<string>`coalesce(sum(${schema.refunds.amountKobo}),0)` }).from(schema.refunds)
      .where(and(eq(schema.refunds.paymentId, paymentId), inArray(schema.refunds.status, [...COUNTED])));
    const total = p.paidAmountKobo ?? p.amountKobo;
    if (Number(done.t) < total && p.status === "REFUNDED") { // a refund failed after we'd marked the payment fully refunded
      await tx.update(schema.payments).set({ status: "SUCCESSFUL" }).where(eq(schema.payments.id, paymentId));
      await tx.update(schema.orders).set({ adminNote: "A refund failed, so the payment was restored. Check refunds and the order status." }).where(eq(schema.orders.id, p.orderId));
    }
    if (Number(done.t) >= total && p.status !== "REFUNDED") {
      await tx.update(schema.payments).set({ status: "REFUNDED" }).where(eq(schema.payments.id, paymentId));
      const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, p.orderId)).for("update");
      if (["PAID", "REVIEW", "PROCESSING"].includes(o.status)) {
        await tx.update(schema.orders).set({ status: "CANCELLED", adminNote: `Fully refunded by ${adminEmail}` }).where(eq(schema.orders.id, o.id));
        await releaseStock(tx, o.id);
      } else await tx.update(schema.orders).set({ adminNote: `Fully refunded by ${adminEmail} (order was ${o.status.toLowerCase()})` }).where(eq(schema.orders.id, o.id));
    }
  });
}

/**
 * Record a refund for one payment. method "flutterwave" asks the provider to send the money back;
 * "manual" records a refund the admin already made outside the system (bank transfer etc.).
 * The refundable amount is checked under a row lock so two admins can't refund the same money twice.
 */
export async function createRefund(a: { paymentId: number; amountKobo: number; reason: string; method: "flutterwave" | "manual"; adminEmail: string; reference?: string }) {
  if (!Number.isInteger(a.amountKobo) || a.amountKobo <= 0) throw new RefundError("Enter an amount greater than zero");
  const refund = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, a.paymentId)).for("update");
    if (!p) throw new RefundError("Payment not found");
    if (!["SUCCESSFUL", "REVIEW"].includes(p.status) || p.paidAmountKobo == null) throw new RefundError("Only confirmed payments can be refunded");
    if (a.method === "flutterwave" && (p.provider !== "flutterwave" || !p.providerTxId)) throw new RefundError("This payment can't be refunded through Flutterwave; record a manual refund instead");
    const [done] = await tx.select({ t: sql<string>`coalesce(sum(${schema.refunds.amountKobo}),0)` }).from(schema.refunds)
      .where(and(eq(schema.refunds.paymentId, p.id), inArray(schema.refunds.status, [...COUNTED])));
    const left = (p.paidAmountKobo ?? p.amountKobo) - Number(done.t);
    if (a.amountKobo > left) throw new RefundError(`Only ₦${(left / 100).toLocaleString()} is left to refund on this payment`);
    const [r] = await tx.insert(schema.refunds).values({
      orderId: p.orderId, paymentId: p.id, amountKobo: a.amountKobo, reason: a.reason.slice(0, 300), method: a.method, createdBy: a.adminEmail,
      status: a.method === "manual" ? "PROCESSED" : "REQUESTED", providerRef: a.reference?.slice(0, 120) || null, processedAt: a.method === "manual" ? new Date() : null,
    }).returning();
    await tx.insert(schema.auditLog).values({ actor: a.adminEmail, action: "refund.create", detail: `payment ${p.id}: ₦${a.amountKobo / 100} via ${a.method}` });
    return { r, providerTxId: p.providerTxId };
  });

  if (a.method === "flutterwave") {
    try {
      const out = await refundTransaction(refund.providerTxId!, toNairaNumber(a.amountKobo));
      const completed = ["completed", "successful", "success"].includes(out.status);
      await db.update(schema.refunds).set({ providerRef: out.ref, status: completed ? "PROCESSED" : "REQUESTED", processedAt: completed ? new Date() : null }).where(eq(schema.refunds.id, refund.r.id));
    } catch (e) {
      await db.update(schema.refunds).set({ status: "FAILED", error: String((e as Error).message).slice(0, 300) }).where(eq(schema.refunds.id, refund.r.id));
      throw new RefundError(`Flutterwave refused the refund: ${(e as Error).message}`);
    }
  }
  await settle(a.paymentId, a.adminEmail);
  return refund.r.id;
}

/** A Flutterwave refund starts as pending; once the money has landed back with the customer the admin confirms it here. */
export async function setRefundStatus(id: number, status: "PROCESSED" | "FAILED", adminEmail: string) {
  const [r] = await db.update(schema.refunds).set({ status, processedAt: status === "PROCESSED" ? new Date() : null })
    .where(and(eq(schema.refunds.id, id), eq(schema.refunds.status, "REQUESTED"))).returning();
  if (!r) throw new RefundError("Only pending refunds can be updated");
  await db.insert(schema.auditLog).values({ actor: adminEmail, action: `refund.${status.toLowerCase()}`, detail: `refund ${id}` });
  if (r.paymentId) await settle(r.paymentId, adminEmail); // a FAILED refund frees the amount again
}
