import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
// Receipts are private: only a signed-in admin can read them, and only files that exist in the proofs table.
export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { file } = await params;
  const [proof] = await db.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.fileName, file));
  if (!proof) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await readFile(path.join(process.cwd(), "uploads", "receipts", path.basename(proof.fileName)));
  return new NextResponse(buf, { headers: { "content-type": proof.mime, "x-content-type-options": "nosniff", "content-disposition": "inline", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } });
}
