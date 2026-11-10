import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { reconcileTxRef } from "@/lib/payments";

export const dynamic = "force-dynamic";

// Flutterwave redirects here after hosted checkout. Query-string "status" is NEVER trusted:
// we ask the provider directly and only then move the order.
export default async function Return({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ k?: string }> }) {
  const { number } = await params; const { k = "" } = await searchParams;
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.accessToken, k)));
  if (!o) redirect("/");
  const pays = await db.select().from(schema.payments).where(and(eq(schema.payments.orderId, o.id), eq(schema.payments.status, "PENDING")));
  for (const p of pays) { try { await reconcileTxRef(p.txRef); } catch { /* the pay page keeps polling */ } }
  redirect(`/order/${number}?k=${k}`);
}
