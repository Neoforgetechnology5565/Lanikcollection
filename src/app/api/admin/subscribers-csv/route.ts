import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/session";
export const dynamic = "force-dynamic";
const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select().from(schema.subscribers).orderBy(desc(schema.subscribers.createdAt));
  return new NextResponse(["email,subscribed_at,status", ...rows.map((r) => [r.email, r.createdAt.toISOString(), r.unsubscribedAt ? "unsubscribed" : "subscribed"].map(cell).join(","))].join("\n"),
    { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="subscribers.csv"' } });
}
