import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { createAdminSession, getAdmin } from "@/lib/session";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Admin sign in", robots: { index: false } };
const fails = new Map<string, { n: number; until: number }>(); // best-effort throttle (per server instance)

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const f = fails.get(email);
  if (f && f.n >= 5 && f.until > Date.now()) redirect("/admin/login?e=locked");
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.email, email));
  // compare against a dummy hash when the user doesn't exist so timing doesn't reveal which emails are admins
  const ok = await bcrypt.compare(password, a?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!a || !ok) { fails.set(email, { n: (f?.n ?? 0) + 1, until: Date.now() + 10 * 60_000 }); redirect("/admin/login?e=1"); }
  fails.delete(email);
  await createAdminSession(a.email);
  redirect("/admin");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getAdmin()) redirect("/admin");
  const { e } = await searchParams;
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <form action={login} className="card p-8 w-full max-w-sm space-y-4">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="text-center font-semibold uppercase tracking-widest text-sm">Administrator</h1>
        {e && <p role="alert" className="text-red-700 text-sm">{e === "locked" ? "Too many attempts. Try again in 10 minutes." : "Invalid email or password."}</p>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="username" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
        <button className="btn btn-dark w-full">Sign in</button>
      </form>
    </div>
  );
}
