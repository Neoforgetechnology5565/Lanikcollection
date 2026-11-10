import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
// Guard against spreadsheet formula injection in exported text.
const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db.select({ p: schema.payments, n: schema.orders.number }).from(schema.payments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.payments.orderId)).orderBy(desc(schema.payments.id));
  const head = ["date", "order", "method", "tx_ref", "provider_id", "status", "expected_ngn", "confirmed_ngn", "va_bank", "va_account", "note"];
  const lines = rows.map(({ p, n }) => [p.createdAt.toISOString(), n, p.method, p.txRef, p.providerTxId, p.status, p.amountKobo / 100, p.paidAmountKobo != null ? p.paidAmountKobo / 100 : "", p.vaBank, p.vaAccountNumber, p.note ?? p.failureReason].map(cell).join(","));
  return new NextResponse([head.join(","), ...lines].join("\n"), { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="payments.csv"' } });
}
