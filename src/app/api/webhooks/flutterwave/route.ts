import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { reconcileTxRef } from "@/lib/payments";

export const dynamic = "force-dynamic";

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const expected = process.env.FLW_SECRET_HASH;
  const given = req.headers.get("verif-hash") ?? "";
  if (!expected || !sameSecret(given, expected)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const d = body?.data ?? body;
  const txRef: string | undefined = d?.tx_ref ?? d?.txRef;
  if (!txRef) return NextResponse.json({ ok: true, ignored: "no tx_ref" });

  const eventKey = `${body?.event ?? body?.["event.type"] ?? "evt"}:${d?.id ?? txRef}:${d?.status ?? ""}`;
  const [seen] = await db.select({ id: schema.webhookEvents.id }).from(schema.webhookEvents).where(eq(schema.webhookEvents.eventKey, eventKey));
  if (seen) return NextResponse.json({ ok: true, duplicate: true });

  try {
    // The payload is only a hint. The outcome comes from our own authenticated verification call.
    const result = await reconcileTxRef(txRef);
    await db.insert(schema.webhookEvents).values({ eventKey, txRef, payload: body }).onConflictDoNothing();
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("webhook reconcile failed", txRef, e);
    return NextResponse.json({ error: "verification failed, retry" }, { status: 500 }); // provider will retry
  }
}
