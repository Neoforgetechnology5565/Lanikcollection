import Link from "next/link";
import { and, count, desc, eq, lte, sql, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
const Stat = ({ l, v, warn }: { l: string; v: string | number; warn?: boolean }) =>
  <div className={`card p-4 ${warn ? "border-amber-400" : ""}`}><p className="text-xs uppercase tracking-widest text-ink/60">{l}</p><p className="font-serif text-2xl font-bold mt-1">{v}</p></div>;

export default async function Dashboard() {
  const PAIDISH = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
  const [rev] = await db.select({ t: sql<string>`coalesce(sum(${schema.orders.totalKobo}),0)`, n: count() }).from(schema.orders).where(sql`${schema.orders.status} in ('PAID','PROCESSING','SHIPPED','DELIVERED')`);
  const [all] = await db.select({ n: count() }).from(schema.orders);
  const [await_] = await db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.status, "AWAITING_PAYMENT"));
  const [review] = await db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.status, "REVIEW"));
  const [proofs] = await db.select({ n: count() }).from(schema.paymentProofs).where(eq(schema.paymentProofs.status, "PENDING"));
  const [low] = await db.select({ n: count() }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(and(eq(schema.products.active, true), lte(schema.productVariants.stock, 5)));
  const days = await db.select({ d: sql<string>`to_char(${schema.orders.paidAt}, 'MM-DD')`, t: sql<string>`sum(${schema.orders.totalKobo})` })
    .from(schema.orders).where(and(gte(schema.orders.paidAt, sql`now() - interval '14 days'`))).groupBy(sql`1`).orderBy(sql`1`);
  const recent = await db.select().from(schema.orders).orderBy(desc(schema.orders.id)).limit(6);
  const lowList = await db.select({ name: schema.products.name, size: schema.productVariants.size, color: schema.productVariants.color, stock: schema.productVariants.stock, id: schema.productVariants.id }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(and(eq(schema.products.active, true), lte(schema.productVariants.stock, 5))).orderBy(schema.productVariants.stock).limit(6);
  const max = Math.max(1, ...days.map((d) => Number(d.t)));
  void PAIDISH;
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat l="Revenue (verified)" v={naira(Number(rev.t))} /><Stat l="Paid orders" v={rev.n} /><Stat l="All orders" v={all.n} />
        <Stat l="Awaiting payment" v={await_.n} /><Stat l="Needs review" v={review.n} warn={review.n > 0} />
        <Stat l="Receipts to verify" v={proofs.n} warn={proofs.n > 0} /><Stat l="Low-stock variants" v={low.n} warn={low.n > 0} />
      </div>
      <section className="card p-5"><h2 className="font-semibold mb-3">Verified sales, last 14 days</h2>
        {days.length === 0 ? <p className="text-sm text-ink/60">No paid orders yet.</p> :
          <div className="flex items-end gap-2 h-32">{days.map((d) => <div key={d.d} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-gold" style={{ height: `${(Number(d.t) / max) * 100}%` }} title={naira(Number(d.t))} /><span className="text-[10px]">{d.d}</span></div>)}</div>}
      </section>
      <div className="grid md:grid-cols-2 gap-5">
        <section className="card p-5"><div className="flex justify-between"><h2 className="font-semibold">Recent orders</h2><Link href="/admin/orders" className="text-xs underline">All</Link></div>
          <ul className="mt-3 divide-y divide-champagne text-sm">{recent.length === 0 && <li className="py-2 text-ink/60">None yet.</li>}{recent.map((o) => <li key={o.id} className="py-2 flex justify-between gap-2"><Link className="underline" href={`/admin/orders/${o.number}`}>{o.number}</Link><span className="text-xs text-bronze">{o.status.replace("_", " ")}</span><b>{naira(o.totalKobo)}</b></li>)}</ul></section>
        <section className="card p-5"><div className="flex justify-between"><h2 className="font-semibold">Low stock</h2><Link href="/admin/inventory?low=1" className="text-xs underline">Inventory</Link></div>
          <ul className="mt-3 divide-y divide-champagne text-sm">{lowList.length === 0 && <li className="py-2 text-ink/60">All good.</li>}{lowList.map((p) => <li key={p.id} className="py-2 flex justify-between"><span>{p.name} <span className="text-ink/50 text-xs">{[p.size, p.color].filter(Boolean).join(" / ")}</span></span><b className={p.stock === 0 ? "text-red-700" : "text-amber-700"}>{p.stock}</b></li>)}</ul></section>
      </div>
    </div>
  );
}
