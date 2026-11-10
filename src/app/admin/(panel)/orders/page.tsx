import Link from "next/link";
import { desc, eq, ilike, or, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
const STATUSES = ["AWAITING_PAYMENT", "PAID", "REVIEW", "PROCESSING", "SHIPPED", "DELIVERED", "EXPIRED", "CANCELLED"] as const;
const tone: Record<string, string> = { PAID: "bg-green-100 text-green-900", REVIEW: "bg-orange-100 text-orange-900", AWAITING_PAYMENT: "bg-amber-100 text-amber-900", EXPIRED: "bg-gray-200", CANCELLED: "bg-gray-200", PROCESSING: "bg-blue-100 text-blue-900", SHIPPED: "bg-indigo-100 text-indigo-900", DELIVERED: "bg-emerald-100 text-emerald-900" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q, status } = await searchParams;
  const st = STATUSES.find((s) => s === status);
  const like = q ? `%${q.replace(/[%_\\]/g, "")}%` : null;
  const rows = await db.select().from(schema.orders)
    .where(and(st ? eq(schema.orders.status, st) : undefined, like ? or(ilike(schema.orders.number, like), ilike(schema.orders.customerName, like), ilike(schema.orders.email, like), ilike(schema.orders.phone, like)) : undefined))
    .orderBy(desc(schema.orders.id)).limit(150);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl font-bold">Orders</h1>
      <form className="flex gap-2 flex-wrap"><input name="q" defaultValue={q} placeholder="Search order no., name, email, phone" className="input max-w-sm" />{st && <input type="hidden" name="status" value={st} />}<button className="btn btn-dark">Search</button></form>
      <div className="flex gap-1.5 flex-wrap text-xs"><Link href="/admin/orders" className={`btn ${!st ? "btn-dark" : "btn-line"} !py-1`}>All</Link>{STATUSES.map((s) => <Link key={s} href={`/admin/orders?status=${s}`} className={`btn ${st === s ? "btn-dark" : "btn-line"} !py-1`}>{s.replace("_", " ")}</Link>)}</div>
      <div className="overflow-x-auto card"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Order", "Customer", "Total", "Status", "Note"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((o) => (
          <tr key={o.id} className="border-t border-champagne align-top">
            <td className="p-2"><Link className="font-bold underline" href={`/admin/orders/${o.number}`}>{o.number}</Link><br /><span className="text-xs text-ink/60">{o.createdAt.toLocaleString("en-NG")}</span></td>
            <td className="p-2">{o.customerName}<br /><span className="text-xs">{o.phone} · {o.city}, {o.state}</span></td>
            <td className="p-2 whitespace-nowrap">{naira(o.totalKobo)}</td>
            <td className="p-2"><span className={`text-xs font-bold px-2 py-0.5 ${tone[o.status]}`}>{o.status.replace("_", " ")}</span></td>
            <td className="p-2 text-xs max-w-56 text-ink/70">{o.adminNote}</td>
          </tr>))}</tbody></table>{rows.length === 0 && <p className="p-4 text-sm text-ink/60">No orders match.</p>}</div>
    </div>
  );
}
