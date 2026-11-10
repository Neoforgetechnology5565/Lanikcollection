import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
export async function POST(req: Request) {
  const b = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await db.insert(schema.subscribers).values({ email: b.data.email }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
