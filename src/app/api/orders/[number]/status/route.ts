import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { reconcileTxRef, expireDueOrders } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Polled by the pay page. Read-only for the customer: this endpoint can only *ask the provider*
// whether a payment happened; it can never be told so by the browser.
export async function GET(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.accessToken, k)));
  if (!o) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (o.status === "AWAITING_PAYMENT") {
    const pend = await db.select().from(schema.payments)
      .where(and(eq(schema.payments.orderId, o.id), eq(schema.payments.status, "PENDING"))).orderBy(desc(schema.payments.id));
    for (const p of pend) { try { await reconcileTxRef(p.txRef); } catch { /* provider hiccup: next poll retries */ } }
    if (o.expiresAt && o.expiresAt < new Date()) await expireDueOrders(5).catch(() => {});
  }
  const [fresh] = await db.select({ status: schema.orders.status, expiresAt: schema.orders.expiresAt }).from(schema.orders).where(eq(schema.orders.id, o.id));
  return NextResponse.json({ status: fresh.status, expiresAt: fresh.expiresAt });
}
