import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, schema } from "@/db";
import { createCustomerSession, getCustomerId } from "@/lib/session";

export const metadata = { title: "Create account" };
async function register(fd: FormData) {
  "use server";
  const p = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(200), phone: z.string().trim().max(25).optional(), password: z.string().min(8).max(100) })
    .safeParse({ name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone") || undefined, password: fd.get("password") });
  if (!p.success) redirect("/account/register?e=invalid");
  const [ex] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.email, p.data.email));
  if (ex) redirect("/account/register?e=exists");
  const [c] = await db.insert(schema.customers).values({ name: p.data.name, email: p.data.email, phone: p.data.phone ?? null, passwordHash: await bcrypt.hash(p.data.password, 11) }).returning();
  await createCustomerSession(c.id); redirect("/account");
}
export default async function Register({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getCustomerId()) redirect("/account");
  const { e } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 pt-14">
      <p className="eyebrow text-center">Join Lanik</p><h1 className="section-title text-center mt-2">Create account</h1>
      <form action={register} className="card p-7 mt-8 space-y-4">
        {e && <p role="alert" className="text-red-700 text-sm">{e === "exists" ? "An account with that email already exists." : "Check your details. Password needs 8+ characters."}</p>}
        <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required className="input" autoComplete="name" /></div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
        <div><label className="label" htmlFor="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" className="input" autoComplete="tel" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" /></div>
        <button className="btn btn-dark w-full">Create account</button>
      </form>
      <p className="text-center text-sm mt-5">Already registered? <Link href="/account/login" className="underline font-semibold">Sign in</Link>. You can also check out as a guest.</p>
    </div>
  );
}
