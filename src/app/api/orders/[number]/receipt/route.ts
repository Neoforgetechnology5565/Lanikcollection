import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { toKobo } from "@/lib/money";
import { sniffImage } from "@/lib/uploads";
import { ipOf, limited } from "@/lib/ratelimit";
import { putPrivate } from "@/lib/storage";

export const dynamic = "force-dynamic";
const OK: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

// Manual transfer: the customer submits evidence. This only creates a PENDING proof; an admin must approve it.
export async function POST(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  if (await limited(`receipt:ip:${ipOf(req)}`, 20, 3600)) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const k = String(form.get("k") ?? "");
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.number, number), eq(schema.orders.accessToken, k)));
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (o.status !== "AWAITING_PAYMENT" && o.status !== "EXPIRED") return NextResponse.json({ error: "This order cannot accept a receipt" }, { status: 409 });

  const [pay] = await db.select().from(schema.payments).where(and(eq(schema.payments.orderId, o.id), eq(schema.payments.method, "manual_transfer")));
  if (!pay) return NextResponse.json({ error: "Manual transfer was not selected for this order" }, { status: 409 });

  const file = form.get("receipt");
  const reference = String(form.get("reference") ?? "").trim();
  const amount = Number(form.get("amount"));
  if (!(file instanceof File) || !OK[file.type]) return NextResponse.json({ error: "Upload a JPG, PNG, WEBP or PDF receipt" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Receipt must be under 5MB" }, { status: 400 });
  if (reference.length < 3 || !(amount > 0)) return NextResponse.json({ error: "Enter the transaction reference and amount" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  // trust the bytes, not the browser's claimed type
  const sig = sniffImage(buf); const isPdf = buf.subarray(0, 5).toString() === "%PDF-";
  if (!sig && !isPdf) return NextResponse.json({ error: "That file doesn't look like a JPG, PNG, WEBP or PDF" }, { status: 400 });
  const mime = sig ? sig.mime : "application/pdf"; const ext = sig ? sig.ext : "pdf";
  const fileName = `${o.number}-${randomBytes(6).toString("hex")}.${ext}`;
  try { await putPrivate(fileName, buf, mime); } catch (e) { console.error("receipt store failed", e); return NextResponse.json({ error: "Could not store the receipt. Please try again." }, { status: 500 }); }
  await db.insert(schema.paymentProofs).values({
    orderId: o.id, paymentId: pay.id, reference: reference.slice(0, 120), amountKobo: toKobo(amount), fileName, mime,
  });
  return NextResponse.json({ ok: true });
}
