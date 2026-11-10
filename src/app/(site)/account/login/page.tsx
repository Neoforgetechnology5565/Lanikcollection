import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { createCustomerSession, getCustomerId } from "@/lib/session";

export const metadata = { title: "Sign in" };
const fails = new Map<string, { n: number; until: number }>();
async function login(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase(); const pw = String(fd.get("password") ?? "");
  const f = fails.get(email); if (f && f.n >= 8 && f.until > Date.now()) redirect("/account/login?e=locked");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
  const ok = await bcrypt.compare(pw, c?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!c || !ok) { fails.set(email, { n: (f?.n ?? 0) + 1, until: Date.now() + 10 * 60_000 }); redirect("/account/login?e=1"); }
  fails.delete(email); await createCustomerSession(c.id); redirect("/account");
}
export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getCustomerId()) redirect("/account");
  const { e } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 pt-14">
      <p className="eyebrow text-center">Welcome back</p><h1 className="section-title text-center mt-2">Sign in</h1>
      <form action={login} className="card p-7 mt-8 space-y-4">
        {e && <p role="alert" className="text-red-700 text-sm">{e === "locked" ? "Too many attempts. Try again later." : "Invalid email or password."}</p>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
        <button className="btn btn-dark w-full">Sign in</button>
      </form>
      <p className="text-center text-sm mt-5">New here? <Link href="/account/register" className="underline font-semibold">Create an account</Link> · <Link href="/track" className="underline">Track an order as guest</Link></p>
    </div>
  );
}
