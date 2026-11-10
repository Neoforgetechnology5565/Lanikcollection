import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import bcrypt from "bcryptjs";
import { createCustomerSession, destroyCustomerSession, getCustomerId } from "@/lib/session";
import { clientIp, limited } from "@/lib/ratelimit";
import { issueToken, appUrl } from "@/lib/customerAuth";
import { mailVerifyEmail } from "@/lib/mail";
import { naira } from "@/lib/money";

export const metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

async function logout() { "use server"; await destroyCustomerSession(); redirect("/"); }
async function resendVerify() {
  "use server"; const id = await getCustomerId(); if (!id) return;
  if (await limited(`verify:cust:${id}`, 3, 3600)) redirect("/account?e=limit");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  if (c && !c.emailVerifiedAt) await mailVerifyEmail(c.email, c.name, `${appUrl()}/account/verify?token=${await issueToken(c.id, "verify", 24 * 60)}`);
  redirect("/account?resent=1");
}
async function changePassword(fd: FormData) {
  "use server"; const id = await getCustomerId(); if (!id) return;
  if (await limited(`chpw:cust:${id}:${await clientIp()}`, 6, 3600)) redirect("/account?e=limit");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id));
  const next = String(fd.get("next") ?? "");
  if (!c || next.length < 8 || next.length > 100 || !(await bcrypt.compare(String(fd.get("current") ?? ""), c.passwordHash))) redirect("/account?e=pw");
  // new tokenVersion signs out every other device; re-issue this device's session
  const [u] = await db.update(schema.customers).set({ passwordHash: await bcrypt.hash(next, 11), tokenVersion: sql`${schema.customers.tokenVersion} + 1` }).where(eq(schema.customers.id, id)).returning();
  await createCustomerSession(u.id, u.tokenVersion); redirect("/account?pw=1");
}
async function saveProfile(fd: FormData) {
  "use server"; const id = await getCustomerId(); if (!id) return;
  await db.update(schema.customers).set({ name: String(fd.get("name") ?? "").trim().slice(0, 100) || "Customer", phone: String(fd.get("phone") ?? "").trim().slice(0, 25) || null }).where(eq(schema.customers.id, id));
  revalidatePath("/account");
}
async function addAddress(fd: FormData) {
  "use server"; const id = await getCustomerId(); if (!id) return;
  const [address, city, state] = ["address", "city", "state"].map((k) => String(fd.get(k) ?? "").trim().slice(0, 200));
  if (!address || !city || !state) return;
  await db.insert(schema.addresses).values({ customerId: id, label: String(fd.get("label") ?? "Home").slice(0, 30), address, city, state, phone: String(fd.get("phone") ?? "").slice(0, 25) || null });
  revalidatePath("/account");
}
async function delAddress(fd: FormData) {
  "use server"; const id = await getCustomerId(); if (!id) return;
  await db.delete(schema.addresses).where(and(eq(schema.addresses.id, Number(fd.get("id"))), eq(schema.addresses.customerId, id)));
  revalidatePath("/account");
}

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string; verified?: string; resent?: string; e?: string; pw?: string }> }) {
  const sp = await searchParams;
  const id = await getCustomerId(); if (!id) redirect("/account/login");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)); if (!c) redirect("/account/login");
  // Orders placed as a guest are attached by email ONLY after the email is verified; otherwise anyone could register someone else's address and read their orders.
  const orders = await db.select().from(schema.orders).where(c.emailVerifiedAt ? or(eq(schema.orders.customerId, id), sql`lower(${schema.orders.email}) = ${c.email}`) : eq(schema.orders.customerId, id)).orderBy(desc(schema.orders.id)).limit(50);
  const addrs = await db.select().from(schema.addresses).where(eq(schema.addresses.customerId, id));
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12">
      <div className="flex items-end justify-between flex-wrap gap-3"><div><p className="eyebrow">My account</p><h1 className="section-title mt-2">Hello, {c.name.split(" ")[0]}</h1></div>
        <form action={logout}><button className="btn btn-line">Sign out</button></form></div>
      {!c.emailVerifiedAt && <div role="status" className="mt-6 bg-amber-50 border border-amber-300 text-amber-900 p-4 text-sm flex flex-wrap items-center gap-3 justify-between">
        <span>{sp.resent ? "Verification email sent. Check your inbox." : "Confirm your email to see orders you placed as a guest and to review products."}</span>
        <form action={resendVerify}><button className="btn btn-line !py-1.5">Resend email</button></form></div>}
      {sp.verified && <p role="status" className="mt-6 bg-green-50 border border-green-300 text-green-900 p-3 text-sm">Email confirmed. Thank you!</p>}
      {sp.pw && <p role="status" className="mt-6 bg-green-50 border border-green-300 text-green-900 p-3 text-sm">Password changed. Other devices have been signed out.</p>}
      {sp.e && <p role="alert" className="mt-6 bg-red-50 border border-red-300 text-red-900 p-3 text-sm">{sp.e === "limit" ? "Too many attempts. Try again later." : "Current password is wrong, or the new one is under 8 characters."}</p>}
      <div className="mt-10 grid md:grid-cols-[1.4fr_1fr] gap-8">
        <section><h2 className="font-serif text-2xl font-bold">Orders</h2>
          {orders.length === 0 ? <p className="mt-3 text-ink/60">No orders yet. <Link className="underline" href="/shop">Start shopping</Link></p> :
            <ul className="mt-4 card divide-y divide-champagne">{orders.map((o) => (
              <li key={o.id}><Link href={`/order/${o.number}?k=${o.accessToken}`} className="p-4 flex justify-between gap-3 hover:bg-champagne/30">
                <span><b>{o.number}</b><br /><span className="text-xs text-ink/60">{o.createdAt.toLocaleDateString("en-NG")}</span></span>
                <span className="text-right"><b>{naira(o.totalKobo)}</b><br /><span className="text-xs uppercase tracking-widest text-bronze">{o.status.replace("_", " ")}</span></span></Link></li>))}</ul>}
        </section>
        <div className="space-y-8">
          <section><h2 className="font-serif text-2xl font-bold">Details</h2>
            <form action={saveProfile} className="card p-4 mt-4 space-y-3"><div><label className="label" htmlFor="n">Name</label><input id="n" name="name" defaultValue={c.name} className="input" /></div>
              <div><label className="label" htmlFor="p">Phone</label><input id="p" name="phone" defaultValue={c.phone ?? ""} className="input" /></div><p className="text-xs text-ink/50">{c.email}</p><button className="btn btn-dark">Save</button></form></section>
          <section><h2 className="font-serif text-2xl font-bold">Password</h2>
            <form action={changePassword} className="card p-4 mt-4 space-y-3"><input name="current" type="password" required placeholder="Current password" autoComplete="current-password" className="input" /><input name="next" type="password" minLength={8} required placeholder="New password (8+ characters)" autoComplete="new-password" className="input" /><button className="btn btn-line">Change password</button></form></section>
          <section><h2 className="font-serif text-2xl font-bold">Saved addresses</h2>
            <ul className="mt-4 space-y-2">{addrs.map((a) => <li key={a.id} className="card p-3 text-sm flex justify-between gap-2"><span><b>{a.label}</b><br />{a.address}, {a.city}, {a.state}</span><form action={delAddress}><input type="hidden" name="id" value={a.id} /><button className="text-red-700 underline text-xs">Delete</button></form></li>)}</ul>
            <form action={addAddress} className="card p-4 mt-3 space-y-2"><input name="label" placeholder="Label (Home, Office…)" className="input" /><input name="address" required placeholder="Street address" className="input" />
              <div className="grid grid-cols-2 gap-2"><input name="city" required placeholder="City" className="input" /><input name="state" required placeholder="State" className="input" /></div><button className="btn btn-line">Add address</button></form></section>
        </div>
      </div>
    </div>
  );
}
