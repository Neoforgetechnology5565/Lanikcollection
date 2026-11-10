import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder, OrderError } from "@/lib/orders";
import { startPayment, PaymentUnavailable } from "@/lib/payments";
import { METHODS } from "@/lib/settings";
import { getCustomerId } from "@/lib/session";
import { mailOrderCreated } from "@/lib/mail";
import { ipOf, limited } from "@/lib/ratelimit";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

const Body = z.object({
  customerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(25),
  address: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(500).optional().nullable(),
  discountCode: z.string().trim().max(40).optional().nullable(),
  method: z.enum(METHODS),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    size: z.string().max(40).optional().nullable(),
    color: z.string().max(40).optional().nullable(),
    qty: z.number().int().min(1).max(500),
  })).min(1).max(50),
});

export async function POST(req: Request) {
  // each order holds stock until it expires, so cap how fast one network can create them
  if (await limited(`checkout:ip:${ipOf(req)}`, 20, 600)) return NextResponse.json({ error: "Too many orders from this network. Please wait a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check your details and try again.", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { method, ...input } = parsed.data;
  const baseUrl = siteUrl(req.url);

  let order;
  try { order = await createOrder({ ...input, customerId: await getCustomerId() }); await mailOrderCreated(order.id); }
  catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  const orderUrl = `/order/${order.number}?k=${order.accessToken}`;
  try {
    const r = await startPayment(order, method, baseUrl);
    return NextResponse.json({ orderNumber: order.number, next: r.kind === "redirect" ? r.url : orderUrl });
  } catch (e) {
    // The order exists (stock is held until it expires) so the customer can retry with another method.
    if (e instanceof PaymentUnavailable) return NextResponse.json({ error: e.message, orderUrl }, { status: 502 });
    console.error("startPayment failed", e);
    return NextResponse.json({ error: "We could not start the payment. Please try another method.", orderUrl }, { status: 502 });
  }
}
