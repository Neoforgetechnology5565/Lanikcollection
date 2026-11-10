import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const metadata = { title: "Track your order" };
async function track(fd: FormData) {
  "use server";
  const number = String(fd.get("number") ?? "").trim().toUpperCase(); const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.number, number), sql`lower(${schema.orders.email}) = ${email}`));
  if (!o) redirect("/track?e=1");
  redirect(`/order/${o.number}?k=${o.accessToken}`);
}
export default async function Track({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 pt-14">
      <p className="eyebrow text-center">Where&apos;s my order?</p><h1 className="section-title text-center mt-2">Track your order</h1>
      <form action={track} className="card p-7 mt-8 space-y-4">
        {e && <p role="alert" className="text-red-700 text-sm">We couldn&apos;t find an order with those details.</p>}
        <div><label className="label" htmlFor="number">Order number</label><input id="number" name="number" required placeholder="LNK-251110-ABC123" className="input uppercase" /></div>
        <div><label className="label" htmlFor="email">Email used at checkout</label><input id="email" name="email" type="email" required className="input" /></div>
        <button className="btn btn-dark w-full">Track order</button>
      </form>
    </div>
  );
}
