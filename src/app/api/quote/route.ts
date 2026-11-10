import { NextResponse } from "next/server";
import { z } from "zod";
import { priceCart, OrderError } from "@/lib/orders";

export const dynamic = "force-dynamic";
const Body = z.object({
  state: z.string().max(100).optional().nullable(), discountCode: z.string().max(40).optional().nullable(),
  items: z.array(z.object({ productId: z.number().int().positive(), size: z.string().max(40).nullable().optional(), color: z.string().max(40).nullable().optional(), qty: z.number().int().min(1).max(500) })).min(1).max(50),
});
// Server-computed totals for the checkout summary (wholesale tiers, discount, shipping by state).
export async function POST(req: Request) {
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try { return NextResponse.json(await priceCart(b.data)); }
  catch (e) { if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: 409 }); throw e; }
}
