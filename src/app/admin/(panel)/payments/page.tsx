import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";
import { METHOD_LABELS, type Method } from "@/lib/methods";
import { flwConfig } from "@/lib/flutterwave";

export const dynamic = "force-dynamic";
const STATUSES = ["PENDING", "SUCCESSFUL", "FAILED", "EXPIRED", "REVIEW", "REFUNDED"] as const;
const tone: Record<string, string> = { SUCCESSFUL: "bg-green-100 text-green-900", PENDING: "bg-amber-100 text-amber-900", FAILED: "bg-red-100 text-red-900", EXPIRED: "bg-gray-200 text-gray-800", REVIEW: "bg-orange-100 text-orange-900", REFUNDED: "bg-blue-100 text-blue-900" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string; method?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const method = sp.method && sp.method in METHOD_LABELS ? sp.method : undefined;
  const where = and(status ? eq(schema.payments.status, status) : undefined, method ? eq(schema.payments.method, method) : undefined);
  const rows = await db.select({ p: schema.payments, number: schema.orders.number }).from(schema.payments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.payments.orderId)).where(where).orderBy(desc(schema.payments.id)).limit(200);
  const report = await db.select({ status: schema.payments.status, method: schema.payments.method, n: sql<number>`count(*)::int`, t: sql<string>`coalesce(sum(coalesce(${schema.payments.paidAmountKobo}, ${schema.payments.amountKobo})),0)` })
    .from(schema.payments).groupBy(schema.payments.status, schema.payments.method);
  let mode = "not configured"; try { mode = flwConfig().mode; } catch { /* leave */ }
  const q = (o: Record<string, string | undefined>) => { const u = new URLSearchParams(); Object.entries({ status: sp.status, method: sp.method, ...o }).forEach(([k, v]) => v && u.set(k, v)); return `?${u}`; };
  const ok = report.filter((r) => r.status === "SUCCESSFUL");
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap"><h1 className="font-serif text-3xl font-bold">Payments</h1>
        <span className={`text-xs font-bold px-2 py-1 ${mode === "live" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>Flutterwave: {mode.toUpperCase()}</span>
        <Link className="btn btn-line !py-1.5 ml-auto" href="/admin/payments/diagnostics">Diagnostics</Link><Link className="btn btn-line !py-1.5" href="/api/admin/payments-csv">Export CSV</Link></div>

      <section className="card p-4"><h2 className="font-semibold mb-2">Report: verified revenue by method</h2>
        {ok.length === 0 ? <p className="text-sm text-ink/60">No successful payments yet.</p> :
          <table className="text-sm w-full"><tbody>{ok.map((r) => <tr key={r.method} className="border-t border-champagne"><td className="py-1">{METHOD_LABELS[r.method as Method] ?? r.method}</td><td>{r.n} payments</td><td className="text-right font-semibold">{naira(Number(r.t))}</td></tr>)}</tbody></table>}
      </section>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href={q({ status: undefined })} className={`btn ${!status ? "btn-dark" : "btn-line"} !py-1`}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={q({ status: s })} className={`btn ${status === s ? "btn-dark" : "btn-line"} !py-1`}>{s}</Link>)}
        <span className="mx-2" />
        {Object.entries(METHOD_LABELS).map(([m]) => <Link key={m} href={q({ method: method === m ? undefined : m })} className={`btn ${method === m ? "btn-dark" : "btn-line"} !py-1`}>{m}</Link>)}
      </div>

      <div className="overflow-x-auto card"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Date", "Order", "Method", "Reference", "Expected", "Confirmed", "Status", "Virtual account"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map(({ p, number }) => (
          <tr key={p.id} className="border-t border-champagne align-top">
            <td className="p-2 whitespace-nowrap">{p.createdAt.toLocaleString("en-NG")}</td>
            <td className="p-2"><Link className="underline" href={`/admin/orders?q=${number}`}>{number}</Link></td>
            <td className="p-2">{p.method}</td>
            <td className="p-2 font-mono text-xs break-all">{p.txRef}{p.providerTxId && <><br />FLW #{p.providerTxId}</>}</td>
            <td className="p-2">{naira(p.amountKobo)}</td>
            <td className="p-2">{p.paidAmountKobo != null ? naira(p.paidAmountKobo) : "—"}</td>
            <td className="p-2"><span className={`px-2 py-0.5 text-xs font-bold ${tone[p.status]}`}>{p.status}</span>{(p.note || p.failureReason) && <p className="text-xs text-ink/60 mt-1 max-w-48">{p.note ?? p.failureReason}</p>}</td>
            <td className="p-2 text-xs">{p.vaAccountNumber ? <>{p.vaBank}<br /><b>{p.vaAccountNumber}</b><br />expires {p.vaExpiresAt?.toLocaleTimeString("en-NG")}</> : "—"}</td>
          </tr>))}</tbody></table>
        {rows.length === 0 && <p className="p-4 text-sm text-ink/60">No transactions match.</p>}
      </div>
    </div>
  );
}
