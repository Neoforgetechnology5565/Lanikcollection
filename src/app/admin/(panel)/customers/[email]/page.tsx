import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";
import { requireAdmin } from "@/lib/session";
import { issueToken, appUrl } from "@/lib/customerAuth";
import { mailPasswordReset } from "@/lib/mail";

export const dynamic = "force-dynamic";
const PAIDISH = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

const here = (email: string, q: string) => `/admin/customers/${encodeURIComponent(email)}?${q}`;
const audit = (actor: string, action: string, detail: string) => db.insert(schema.auditLog).values({ actor, action, detail });
const LIVE = ["AWAITING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "REVIEW"]; // orders still in progress

async function saveCustomer(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const id = Number(fd.get("id")), email = String(fd.get("email"));
  await db.update(schema.customers).set({
    name: String(fd.get("name") ?? "").trim().slice(0, 100) || "Customer", phone: String(fd.get("phone") ?? "").trim().slice(0, 25) || null,
    emailVerifiedAt: fd.get("verified") === "on" ? sql`coalesce(${schema.customers.emailVerifiedAt}, now())` : null,
  }).where(eq(schema.customers.id, id));
  await audit(a.email, "customer.edit", `customer ${id}`); revalidatePath("/admin/customers"); redirect(here(email, "msg=Saved"));
}
async function signOutEverywhere(fd: FormData) {
  "use server"; const a = await requireAdmin(); const id = Number(fd.get("id")), email = String(fd.get("email"));
  await db.update(schema.customers).set({ tokenVersion: sql`${schema.customers.tokenVersion} + 1` }).where(eq(schema.customers.id, id));
  await audit(a.email, "customer.signout", `customer ${id}`); redirect(here(email, "msg=Signed out on every device"));
}
async function sendReset(fd: FormData) {
  "use server"; const a = await requireAdmin(); const id = Number(fd.get("id")), email = String(fd.get("email"));
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)); if (!c) return;
  await mailPasswordReset(c.email, c.name, `${appUrl()}/account/reset?token=${await issueToken(c.id, "reset", 60)}`);
  await audit(a.email, "customer.reset-link", `customer ${id}`); redirect(here(email, "msg=Password reset email sent"));
}
/** Remove the login. Orders are kept (accounting) but no longer linked to the account. */
async function deleteAccount(fd: FormData) {
  "use server"; const a = await requireAdmin(); const id = Number(fd.get("id")), email = String(fd.get("email"));
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== email) redirect(here(email, "err=Type the email exactly to confirm"));
  await db.transaction(async (tx) => {
    await tx.update(schema.orders).set({ customerId: null }).where(eq(schema.orders.customerId, id));
    await tx.delete(schema.customers).where(eq(schema.customers.id, id)); // addresses, wishlist, reviews, tokens cascade
    await tx.insert(schema.auditLog).values({ actor: a.email, action: "customer.delete", detail: `customer ${id}` });
  });
  revalidatePath("/admin/customers"); redirect("/admin/customers");
}
/** Erase personal details from finished orders (privacy request). Refuses while any order is still in progress. */
async function anonymize(fd: FormData) {
  "use server"; const a = await requireAdmin(); const email = String(fd.get("email"));
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== email) redirect(here(email, "err=Type the email exactly to confirm"));
  const orders = await db.select().from(schema.orders).where(sql`lower(${schema.orders.email}) = ${email}`);
  if (orders.some((o) => LIVE.includes(o.status))) redirect(here(email, "err=An order is still in progress. Finish or cancel it first"));
  await db.transaction(async (tx) => {
    for (const o of orders) await tx.update(schema.orders).set({ customerName: "Deleted customer", email: `deleted-${o.id}@removed.invalid`, phone: "-", address: "-", city: "-", notes: null, adminNote: null }).where(eq(schema.orders.id, o.id));
    await tx.delete(schema.subscribers).where(eq(schema.subscribers.email, email));
    await tx.insert(schema.auditLog).values({ actor: a.email, action: "customer.anonymize", detail: `${orders.length} orders` });
  });
  revalidatePath("/admin/customers"); redirect("/admin/customers");
}

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ email: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
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
      {sp.msg && <p role="status" className="bg-green-50 border border-green-300 text-green-900 p-3 text-sm">{sp.msg}</p>}
      {sp.err && <p role="alert" className="bg-red-50 border border-red-300 text-red-900 p-3 text-sm">{sp.err}</p>}
      <section className="card p-5 space-y-5"><h2 className="font-semibold">Manage</h2>
        {acct ? <>
          <form action={saveCustomer} className="grid sm:grid-cols-2 gap-3"><input type="hidden" name="id" value={acct.id} /><input type="hidden" name="email" value={email} />
            <div><label className="label" htmlFor="cn">Name</label><input id="cn" name="name" defaultValue={acct.name} className="input" /></div>
            <div><label className="label" htmlFor="cp">Phone</label><input id="cp" name="phone" defaultValue={acct.phone ?? ""} className="input" /></div>
            <label className="text-sm flex gap-2 items-center"><input type="checkbox" name="verified" defaultChecked={!!acct.emailVerifiedAt} className="accent-[#D99A24]" />Email verified</label>
            <div className="sm:text-right"><button className="btn btn-dark">Save changes</button></div></form>
          <div className="flex flex-wrap gap-3 border-t border-champagne pt-4">
            <form action={sendReset}><input type="hidden" name="id" value={acct.id} /><input type="hidden" name="email" value={email} /><button className="btn btn-line !py-1.5">Email a password-reset link</button></form>
            <form action={signOutEverywhere}><input type="hidden" name="id" value={acct.id} /><input type="hidden" name="email" value={email} /><button className="btn btn-line !py-1.5">Sign out on all devices</button></form></div>
        </> : <p className="text-sm text-ink/60">Guest: there is no login to edit.</p>}
        <div className="border-t border-champagne pt-4 grid md:grid-cols-2 gap-5 text-sm">
          {acct && <form action={deleteAccount} className="space-y-2"><input type="hidden" name="id" value={acct.id} /><input type="hidden" name="email" value={email} />
            <p className="font-semibold text-red-800">Delete the account</p><p className="text-xs text-ink/60">Removes the login, saved addresses, wishlist and reviews. Orders are kept for your records.</p>
            <input name="confirm" placeholder="Type the email to confirm" className="input" /><button className="btn btn-line !py-1.5 text-red-800 border-red-300">Delete account</button></form>}
          <form action={anonymize} className="space-y-2"><input type="hidden" name="email" value={email} />
            <p className="font-semibold text-red-800">Erase personal data from orders</p><p className="text-xs text-ink/60">For privacy requests. Replaces name, email, phone and address on this person&apos;s orders and removes them from the newsletter. Cannot be undone, and is blocked while an order is in progress.</p>
            <input name="confirm" placeholder="Type the email to confirm" className="input" /><button className="btn btn-line !py-1.5 text-red-800 border-red-300">Erase personal data</button></form>
        </div>
      </section>
      {mails.length > 0 && <section className="card p-5 text-sm"><h2 className="font-semibold mb-2">Recent emails</h2><ul className="space-y-1">{mails.map((m) => <li key={m.id} className="flex justify-between gap-3"><span>{m.subject}</span><span className="text-xs text-ink/50">{m.status}</span></li>)}</ul></section>}
    </div>
  );
}
