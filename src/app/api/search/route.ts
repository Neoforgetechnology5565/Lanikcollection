import { NextResponse } from "next/server";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
export const dynamic = "force-dynamic";
// ?q=term  -> suggestions;  ?ids=1,2,3 -> products by id (wishlist)
export async function GET(req: Request) {
  const u = new URL(req.url);
  const cols = { id: schema.products.id, slug: schema.products.slug, name: schema.products.name, priceKobo: schema.products.priceKobo, saleKobo: schema.products.saleKobo, images: schema.products.images, stock: schema.products.stock, categoryId: schema.products.categoryId };
  const ids = (u.searchParams.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 60);
  if (ids.length) return NextResponse.json(await db.select(cols).from(schema.products).where(and(eq(schema.products.active, true), inArray(schema.products.id, ids))));
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json([]);
  const like = `%${q.replace(/[%_\\]/g, "")}%`;
  return NextResponse.json(await db.select(cols).from(schema.products).where(and(eq(schema.products.active, true), or(ilike(schema.products.name, like), ilike(schema.products.description, like)))).limit(6));
}
