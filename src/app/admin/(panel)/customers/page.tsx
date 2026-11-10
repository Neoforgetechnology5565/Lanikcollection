import { desc, sql, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
export default async function Customers() {
  // Everyone who has ordered (guests included), grouped by email, with registered-account info when present.
  const rows = await db.select({
    email: sql<string>`lower(${schema.orders.email})`, name: sql<string>`max(${schema.orders.customerName})`, phone: sql<string>`max(${schema.orders.phone})`,
    orders: sql<number>`count(*)::int`, spent: sql<string>`coalesce(sum(${schema.orders.totalKobo}) filter (where ${schema.orders.status} in ('PAID','PROCESSING','SHIPPED','DELIVERED')),0)`,
    last: sql<Date>`max(${schema.orders.createdAt})`,
  }).from(schema.orders).groupBy(sql`lower(${schema.orders.email})`).orderBy(desc(sql`max(${schema.orders.createdAt})`)).limit(300);
  const accts = new Set((await db.select({ e: schema.customers.email }).from(schema.customers)).map((c) => c.e));
  const [subs] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.subscribers);
  void eq;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2"><h1 className="font-serif text-3xl font-bold">Customers</h1><p className="text-sm text-ink/60">{accts.size} registered · {subs.n} newsletter subscribers</p></div>
      <div className="card overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Customer", "Contact", "Orders", "Verified spend", "Last order", "Account"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.email} className="border-t border-champagne"><td className="p-2 font-semibold">{r.name}</td><td className="p-2">{r.email}<br /><span className="text-xs">{r.phone}</span></td><td className="p-2">{r.orders}</td><td className="p-2">{naira(Number(r.spent))}</td><td className="p-2 text-xs">{new Date(r.last).toLocaleDateString("en-NG")}</td><td className="p-2 text-xs">{accts.has(r.email) ? "Registered" : "Guest"}</td></tr>)}</tbody></table>
        {rows.length === 0 && <p className="p-4 text-sm text-ink/60">No customers yet.</p>}</div>
    </div>
  );
}
