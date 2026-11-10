import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, lt, inArray } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { createHostedPayment, createVirtualAccount, verifyByReference, flwConfig, type VerifiedTx } from "./flutterwave";
import { getSettings, clampExpiry, type Method } from "./settings";
import { releaseStock, tryReserveStock } from "./orders";
import { toKobo, toNairaNumber } from "./money";

type Order = typeof schema.orders.$inferSelect;
type Payment = typeof schema.payments.$inferSelect;

/** Flutterwave hosted-checkout channel names for each of our methods. */
const CHANNEL: Partial<Record<Method, string>> = {
  card: "card", ussd: "ussd", opay: "opay", qr: "nqr", internet_banking: "account",
};

export class PaymentUnavailable extends Error {}

const newTxRef = (orderNumber: string) => `${orderNumber}-${randomBytes(3).toString("hex")}`;

export type StartResult =
  | { kind: "redirect"; url: string; paymentId: number }
  | { kind: "virtual_account"; paymentId: number }
  | { kind: "manual"; paymentId: number };

/**
 * Create a payment attempt for an order. If the provider refuses (channel not enabled on the
 * merchant account, outage, ...) the attempt is recorded as FAILED and PaymentUnavailable is thrown,
 * so the UI can offer another method instead of a dead button.
 */
export async function startPayment(order: Order, method: Method, baseUrl: string): Promise<StartResult> {
  const settings = await getSettings();
  if (!settings.enabledMethods[method]) throw new PaymentUnavailable("This payment method is not available right now");
  const customer = { email: order.email, name: order.customerName, phone: order.phone };
  const txRef = newTxRef(order.number);
  const now = Date.now();

  const base = { orderId: order.id, method, txRef, amountKobo: order.totalKobo, currency: "NGN" } as const;

  if (method === "manual_transfer") {
    if (!settings.bank.accountNumber) throw new PaymentUnavailable("Bank details have not been configured yet");
    const [p] = await db.insert(schema.payments).values({ ...base, provider: "manual" }).returning();
    await db.update(schema.orders).set({ expiresAt: new Date(now + 24 * 3600_000) }).where(eq(schema.orders.id, order.id));
    return { kind: "manual", paymentId: p.id };
  }

  flwConfig(); // throws if keys/mode are misconfigured
  const fail = async (reason: string, raw?: unknown): Promise<never> => {
    await db.insert(schema.payments).values({ ...base, status: "FAILED", failureReason: reason.slice(0, 500), raw: raw as any });
    throw new PaymentUnavailable("That payment option is currently unavailable. Please choose another method.");
  };

  if (method === "bank_transfer") {
    const minutes = clampExpiry(settings.transferExpiryMinutes);
    try {
      const va = await createVirtualAccount({
        txRef, amountNaira: toNairaNumber(order.totalKobo), customer, narration: `LANIK ${order.number}`,
      });
      const ours = new Date(now + minutes * 60_000);
      // Whichever closes first wins; if the provider's account lives shorter than the admin's setting we show the shorter time.
      const effective = va.expiresAt && va.expiresAt < ours ? va.expiresAt : ours;
      const [p] = await db.insert(schema.payments).values({
        ...base, vaBank: va.bank, vaAccountNumber: va.accountNumber, vaAccountName: va.accountName,
        vaNote: va.note, vaExpiresAt: effective, raw: va.raw as any,
      }).returning();
      await db.update(schema.orders).set({ expiresAt: effective }).where(eq(schema.orders.id, order.id));
      return { kind: "virtual_account", paymentId: p.id };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "virtual account failed", (e as any)?.body);
    }
  }

  const channel = CHANNEL[method]!;
  try {
    const link = await createHostedPayment({
      txRef, amountNaira: toNairaNumber(order.totalKobo), options: [channel], customer,
      redirectUrl: `${baseUrl}/order/${order.number}/return?k=${order.accessToken}`,
    });
    const [p] = await db.insert(schema.payments).values({ ...base, checkoutLink: link }).returning();
    await db.update(schema.orders)
      .set({ expiresAt: new Date(now + settings.onlineWindowMinutes * 60_000) }).where(eq(schema.orders.id, order.id));
    return { kind: "redirect", url: link, paymentId: p.id };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "checkout failed", (e as any)?.body);
  }
}

export type ReconcileResult =
  | "unknown" | "pending" | "already" | "paid" | "late_paid" | "review" | "failed" | "ignored";

/** Verify a payment with the provider and apply the outcome. Safe to call repeatedly and concurrently. */
export async function reconcileTxRef(txRef: string): Promise<ReconcileResult> {
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.txRef, txRef));
  if (!p) return "unknown";
  if (p.provider !== "flutterwave") return "ignored";
  if (p.status === "SUCCESSFUL") return "already";
  const v = await verifyByReference(txRef); // authoritative server-to-server call
  if (!v) return "pending";
  return applyVerification(p.id, v);
}

export async function applyVerification(paymentId: number, v: VerifiedTx): Promise<ReconcileResult> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update");
    if (p.status === "SUCCESSFUL") return "already";
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, p.orderId)).for("update");

    if (v.status === "failed") {
      if (p.status === "PENDING") {
        await tx.update(schema.payments).set({ status: "FAILED", providerTxId: String(v.id), failureReason: "Provider reported failure", raw: v.raw as any })
          .where(eq(schema.payments.id, p.id));
      }
      return "failed";
    }
    if (v.status !== "successful") return "pending";

    const paidKobo = toKobo(v.amount);
    const common = { providerTxId: String(v.id), paidAmountKobo: paidKobo, raw: v.raw as any, verifiedAt: new Date() };
    const setReview = async (why: string) => {
      await tx.update(schema.payments).set({ ...common, status: "REVIEW", note: why }).where(eq(schema.payments.id, p.id));
      if (o.status !== "PAID" && o.status !== "PROCESSING" && o.status !== "SHIPPED" && o.status !== "DELIVERED") {
        await tx.update(schema.orders).set({ status: "REVIEW", adminNote: why }).where(eq(schema.orders.id, o.id));
      }
      return "review" as const;
    };

    if (v.currency !== "NGN") return setReview(`Unexpected currency ${v.currency}`);
    if (paidKobo < p.amountKobo) {
      return setReview(`Underpaid: expected ${p.amountKobo / 100}, received ${paidKobo / 100}. Do not ship without resolving.`);
    }
    const note = paidKobo > p.amountKobo ? `Overpaid by ${(paidKobo - p.amountKobo) / 100}` : null;

    // Already settled by another payment => this one is a duplicate that needs a refund.
    if (["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(o.status)) {
      return setReview("Duplicate payment for an order that is already paid. Refund required.");
    }
    if (o.status === "AWAITING_PAYMENT") {
      await tx.update(schema.payments).set({ ...common, status: "SUCCESSFUL", note }).where(eq(schema.payments.id, p.id));
      await tx.update(schema.orders).set({ status: "PAID", paidAt: new Date(), adminNote: note ?? o.adminNote }).where(eq(schema.orders.id, o.id));
      return "paid";
    }
    if (o.status === "EXPIRED" || o.status === "CANCELLED") {
      // Late transfer: the money is real. Take the order back only if stock can be re-reserved.
      const reserved = await tryReserveStock(tx, o.id);
      if (reserved) {
        await tx.update(schema.payments).set({ ...common, status: "SUCCESSFUL", note: `Paid after the window closed. ${note ?? ""}`.trim() })
          .where(eq(schema.payments.id, p.id));
        await tx.update(schema.orders).set({ status: "PAID", paidAt: new Date(), adminNote: "Late payment received after expiry; stock re-reserved." })
          .where(eq(schema.orders.id, o.id));
        return "late_paid";
      }
      return setReview("Payment arrived after expiry and stock is no longer available. Refund or restock.");
    }
    // REVIEW: money confirmed, keep order in review for a human.
    await tx.update(schema.payments).set({ ...common, status: "SUCCESSFUL", note }).where(eq(schema.payments.id, p.id));
    return "paid";
  });
}

/**
 * Close the payment window for unpaid orders. Before expiring an order we ask the provider one last
 * time, so delayed notifications are never lost; if verification itself fails we leave the order
 * open and retry on the next run.
 */
export async function expireDueOrders(limit = 50): Promise<{ expired: number; recovered: number; skipped: number }> {
  const due = await db.select().from(schema.orders)
    .where(and(eq(schema.orders.status, "AWAITING_PAYMENT"), lt(schema.orders.expiresAt, new Date()))).limit(limit);
  let expired = 0, recovered = 0, skipped = 0;
  for (const o of due) {
    const pending = await db.select().from(schema.payments)
      .where(and(eq(schema.payments.orderId, o.id), eq(schema.payments.status, "PENDING")));
    let verifyFailed = false;
    for (const p of pending) {
      if (p.provider !== "flutterwave") continue;
      try { const r = await reconcileTxRef(p.txRef); if (r === "paid") recovered++; }
      catch { verifyFailed = true; }
    }
    if (verifyFailed) { skipped++; continue; }
    // a manual receipt awaiting admin review keeps the order open
    const [openProof] = await db.select({ id: schema.paymentProofs.id }).from(schema.paymentProofs)
      .where(and(eq(schema.paymentProofs.orderId, o.id), eq(schema.paymentProofs.status, "PENDING"))).limit(1);
    if (openProof) { skipped++; continue; }
    const did = await db.transaction(async (tx) => {
      const r = await tx.update(schema.orders).set({ status: "EXPIRED" })
        .where(and(eq(schema.orders.id, o.id), eq(schema.orders.status, "AWAITING_PAYMENT"))).returning({ id: schema.orders.id });
      if (!r.length) return false; // got paid in the meantime
      await tx.update(schema.payments).set({ status: "EXPIRED" })
        .where(and(eq(schema.payments.orderId, o.id), inArray(schema.payments.status, ["PENDING"]), eq(schema.payments.provider, "flutterwave")));
      await releaseStock(tx, o.id);
      return true;
    });
    if (did) expired++;
  }
  return { expired, recovered, skipped };
}

/** Admin-only: approve a manually-submitted receipt. The ONLY non-webhook path to PAID. */
export async function approveManualProof(proofId: number, adminEmail: string) {
  return db.transaction(async (tx) => {
    const [proof] = await tx.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.id, proofId)).for("update");
    if (!proof || proof.status !== "PENDING") throw new Error("Proof is not pending");
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, proof.orderId)).for("update");
    if (proof.amountKobo < o.totalKobo) throw new Error("Declared amount is less than the order total");
    if (o.status === "EXPIRED" || o.status === "CANCELLED") {
      if (!(await tryReserveStock(tx, o.id))) throw new Error("Stock is no longer available for this order");
    }
    await tx.update(schema.paymentProofs).set({ status: "APPROVED", reviewedBy: adminEmail, reviewedAt: new Date() }).where(eq(schema.paymentProofs.id, proof.id));
    if (proof.paymentId) {
      await tx.update(schema.payments).set({ status: "SUCCESSFUL", paidAmountKobo: proof.amountKobo, verifiedAt: new Date(), note: `Approved by ${adminEmail}; ref ${proof.reference}` })
        .where(eq(schema.payments.id, proof.paymentId));
    }
    await tx.update(schema.orders).set({ status: "PAID", paidAt: new Date() }).where(eq(schema.orders.id, o.id));
    await tx.insert(schema.auditLog).values({ actor: adminEmail, action: "proof.approve", detail: `order ${o.number}, proof ${proof.id}` });
  });
}

export async function rejectManualProof(proofId: number, adminEmail: string, reason: string) {
  await db.transaction(async (tx) => {
    const [proof] = await tx.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.id, proofId)).for("update");
    if (!proof || proof.status !== "PENDING") throw new Error("Proof is not pending");
    await tx.update(schema.paymentProofs).set({ status: "REJECTED", reviewedBy: adminEmail, reviewNote: reason, reviewedAt: new Date() }).where(eq(schema.paymentProofs.id, proof.id));
    await tx.insert(schema.auditLog).values({ actor: adminEmail, action: "proof.reject", detail: `proof ${proof.id}: ${reason}` });
  });
}

/** Methods the customer may actually use right now: enabled by the admin AND functional (keys / bank details present). */
export async function availableMethods(): Promise<Method[]> {
  const { flwConfigured } = await import("./flutterwave");
  const s = await getSettings();
  const live = flwConfigured();
  return (Object.keys(s.enabledMethods) as Method[]).filter((m) => {
    if (!s.enabledMethods[m]) return false;
    if (m === "manual_transfer") return !!s.bank.accountNumber;
    return live;
  });
}
