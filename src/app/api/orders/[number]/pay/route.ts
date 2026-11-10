import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { startPayment, PaymentUnavailable } from "@/lib/payments";
import { METHODS } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

// Start (or switch to) a payment method for an existing unpaid order.
export async function POST(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const b = z.object({ k: z.string(), method: z.enum(METHODS) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.accessToken, b.data.k)));
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (o.status !== "AWAITING_PAYMENT") return NextResponse.json({ error: "This order is no longer awaiting payment" }, { status: 409 });
  try {
    const r = await startPayment(o, b.data.method, siteUrl(req.url));
    return NextResponse.json({ next: r.kind === "redirect" ? r.url : null });
  } catch (e) {
    const msg = e instanceof PaymentUnavailable ? e.message : "We could not start the payment. Please try another method.";
    if (!(e instanceof PaymentUnavailable)) console.error(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
