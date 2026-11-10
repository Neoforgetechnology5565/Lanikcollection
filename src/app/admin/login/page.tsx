import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { createAdminSession, getAdmin } from "@/lib/session";
import { Logo } from "@/components/Logo";
import { clientIp, hit, peek, reset } from "@/lib/ratelimit";

export const metadata = { title: "Admin sign in", robots: { index: false } };
const WIN = 15 * 60;

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp(); const ek = `admin:email:${email}`, ik = `admin:ip:${ip}`;
  if ((await peek(ek, WIN)) >= 5 || (await peek(ik, WIN)) >= 20) redirect("/admin/login?e=locked");
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.email, email));
  // compare against a dummy hash when the user doesn't exist so timing doesn't reveal which emails are admins
  const ok = await bcrypt.compare(password, a?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!a || !ok) { await Promise.all([hit(ek, WIN), hit(ik, WIN)]); redirect("/admin/login?e=1"); }
  await reset(ek);
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
        {e && <p role="alert" className="text-red-700 text-sm">{e === "locked" ? "Too many attempts. Try again in 15 minutes." : "Invalid email or password."}</p>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="username" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
        <button className="btn btn-dark w-full">Sign in</button>
      </form>
    </div>
  );
}
