import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/session";
import { getPrivate } from "@/lib/storage";

export const dynamic = "force-dynamic";
// Receipts are private: only a signed-in admin can read them, and only files that exist in the proofs table.
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { file } = await params;
  const [proof] = await db.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.fileName, file));
  if (!proof) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await getPrivate(proof.fileName);
  if (!buf) return NextResponse.json({ error: "file missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": proof.mime, "x-content-type-options": "nosniff", "content-disposition": "inline", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } });
}
