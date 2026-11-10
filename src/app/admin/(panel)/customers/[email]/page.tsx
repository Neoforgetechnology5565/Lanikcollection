import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
const PAIDISH = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export default async function CustomerDetail({ params }: { params: Promise<{ email: string }> }) {
  let email = (await params).email; try { email = decodeURIComponent(email); } catch { /* keep */ }
  email = email.toLowerCase();
  const orders = await db.select().from(schema.orders).where(sql`lower(${schema.orders.email}) = ${email}`).orderBy(desc(schema.orders.id));
  const [acct] = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
  if (!orders.length && !acct) notFound();
  const addrs = acct ? await db.select().from(schema.addresses).where(eq(schema.addresses.customerId, acct.id)) : [];
  const [wl] = acct ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.wishlistItems).where(eq(schema.wishlistItems.customerId, acct.id)) : [{ n: 0 }];
  const [sub] = await db.select().from(schema.subscribers).where(eq(schema.subscribers.email, email));
  const mails = await db.select().from(schema.emails).where(eq(schema.emails.toAddress, email)).orderBy(desc(schema.emails.id)).limit(8);
  const paid = orders.filter((o) => PAIDISH.includes(o.status));
  const spend = paid.reduce((a, o) => a + o.totalKobo, 0);
  const name = acct?.name ?? orders[0]?.customerName ?? email;
  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/admin/customers" className="text-xs uppercase tracking-widest underline">← Customers</Link>
      <div><p className="eyebrow">Customer</p><h1 className="font-serif text-3xl font-bold">{name}</h1><p className="text-sm text-ink/60">{email}{orders[0]?.phone && ` · ${orders[0].phone}`}</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Orders", orders.length], ["Paid orders", paid.length], ["Verified spend", naira(spend)], ["Avg order", paid.length ? naira(Math.round(spend / paid.length)) : "—"]].map(([l, v]) => <div key={l as string} className="card p-4"><p className="text-xs uppercase tracking-widest text-ink/60">{l}</p><p className="font-serif text-2xl font-bold mt-1">{v}</p></div>)}</div>
      <div className="grid md:grid-cols-2 gap-5">
        <section className="card p-5 text-sm space-y-1"><h2 className="font-semibold mb-2">Account</h2>
          {acct ? <><p>Registered {acct.createdAt.toLocaleDateString("en-NG")}</p><p>Email {acct.emailVerifiedAt ? <span className="text-green-800 font-semibold">verified</span> : <span className="text-amber-700 font-semibold">not verified</span>}</p><p>Wishlist items: {wl.n}</p></> : <p className="text-ink/60">Guest: no account.</p>}
          <p>Newsletter: {sub ? `subscribed ${sub.createdAt.toLocaleDateString("en-NG")}` : "not subscribed"}</p></section>
        <section className="card p-5 text-sm"><h2 className="font-semibold mb-2">Saved addresses</h2>{addrs.length ? addrs.map((a) => <p key={a.id}><b>{a.label}</b>: {a.address}, {a.city}, {a.state}</p>) : <p className="text-ink/60">{orders[0] ? `Last delivered to ${orders[0].address}, ${orders[0].city}, ${orders[0].state}` : "None"}</p>}</section>
      </div>
      <section className="card"><h2 className="font-semibold p-4 pb-2">Orders</h2>
        <table className="w-full text-sm"><tbody>{orders.map((o) => <tr key={o.id} className="border-t border-champagne"><td className="p-2"><Link className="underline font-semibold" href={`/admin/orders/${o.number}`}>{o.number}</Link></td><td className="p-2 text-xs">{o.createdAt.toLocaleDateString("en-NG")}</td><td className="p-2 text-xs font-bold">{o.status.replace("_", " ")}</td><td className="p-2 text-right">{naira(o.totalKobo)}</td></tr>)}</tbody></table></section>
      {mails.length > 0 && <section className="card p-5 text-sm"><h2 className="font-semibold mb-2">Recent emails</h2><ul className="space-y-1">{mails.map((m) => <li key={m.id} className="flex justify-between gap-3"><span>{m.subject}</span><span className="text-xs text-ink/50">{m.status}</span></li>)}</ul></section>}
    </div>
  );
}
