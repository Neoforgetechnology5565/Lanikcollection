import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCustomerId } from "@/lib/session";

export const dynamic = "force-dynamic";
const ids = async (cid: number) => (await db.select({ id: schema.wishlistItems.productId }).from(schema.wishlistItems).where(eq(schema.wishlistItems.customerId, cid))).map((r) => r.id);

export async function GET() {
  const cid = await getCustomerId(); if (!cid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ids: await ids(cid) });
}
// PUT {ids}: merge a device's local wishlist into the account (union, never deletes). Returns the merged list.
export async function PUT(req: Request) {
  const cid = await getCustomerId(); if (!cid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = z.object({ ids: z.array(z.number().int().positive()).max(200) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (b.data.ids.length) {
    const real = await db.select({ id: schema.products.id }).from(schema.products).where(inArray(schema.products.id, b.data.ids)); // ignore unknown ids
    if (real.length) await db.insert(schema.wishlistItems).values(real.map((r) => ({ customerId: cid, productId: r.id }))).onConflictDoNothing();
  }
  return NextResponse.json({ ids: await ids(cid) });
}
// POST {productId, on}: add or remove one item
export async function POST(req: Request) {
  const cid = await getCustomerId(); if (!cid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = z.object({ productId: z.number().int().positive(), on: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (b.data.on) {
    const [p] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.id, b.data.productId));
    if (p) await db.insert(schema.wishlistItems).values({ customerId: cid, productId: p.id }).onConflictDoNothing();
  } else await db.delete(schema.wishlistItems).where(and(eq(schema.wishlistItems.customerId, cid), eq(schema.wishlistItems.productId, b.data.productId)));
  return NextResponse.json({ ok: true });
}
