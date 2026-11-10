import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { createCustomerSession, getCustomerId } from "@/lib/session";
import { clientIp, hit, peek, reset } from "@/lib/ratelimit";

export const metadata = { title: "Sign in" };
const WIN = 15 * 60;
async function login(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200); const pw = String(fd.get("password") ?? "");
  const ip = await clientIp();
  const ek = `login:email:${email}`, ik = `login:ip:${ip}`;
  if ((await peek(ek, WIN)) >= 8 || (await peek(ik, WIN)) >= 40) redirect("/account/login?e=locked");
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
  const ok = await bcrypt.compare(pw, c?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!c || !ok) { await Promise.all([hit(ek, WIN), hit(ik, WIN)]); redirect("/account/login?e=1"); }
  await reset(ek); await createCustomerSession(c.id, c.tokenVersion); redirect("/account");
}
export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; reset?: string }> }) {
  if (await getCustomerId()) redirect("/account");
  const { e, reset: r } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 pt-14">
      <p className="eyebrow text-center">Welcome back</p><h1 className="section-title text-center mt-2">Sign in</h1>
      <form action={login} className="card p-7 mt-8 space-y-4">
        {r && <p role="status" className="text-green-800 text-sm">Password updated. Please sign in.</p>}
        {e && <p role="alert" className="text-red-700 text-sm">{e === "locked" ? "Too many attempts. Try again in a few minutes." : "Invalid email or password."}</p>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
        <button className="btn btn-dark w-full">Sign in</button>
        <p className="text-center text-sm"><Link href="/account/forgot" className="underline">Forgot your password?</Link></p>
      </form>
      <p className="text-center text-sm mt-5">New here? <Link href="/account/register" className="underline font-semibold">Create an account</Link> · <Link href="/track" className="underline">Track an order as guest</Link></p>
    </div>
  );
}
