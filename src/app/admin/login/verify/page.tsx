import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { clearPending2fa, createAdminSession, getPending2fa } from "@/lib/session";
import { verifySecondFactor } from "@/lib/adminAuth";
import { clientIp, hit, peek, reset } from "@/lib/ratelimit";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Two-step verification", robots: { index: false } };
const WIN = 15 * 60;

async function verify(fd: FormData) {
  "use server";
  const p = await getPending2fa(); if (!p) redirect("/admin/login");
  const ek = `admin2fa:email:${p.email}`, ik = `admin2fa:ip:${await clientIp()}`;
  if ((await peek(ek, WIN)) >= 6 || (await peek(ik, WIN)) >= 30) redirect("/admin/login/verify?e=locked");
  const [a] = await db.select().from(schema.admins).where(eq(schema.admins.email, p.email));
  if (!a || a.tokenVersion !== p.v || !(await verifySecondFactor(p.email, String(fd.get("code") ?? "")))) {
    await Promise.all([hit(ek, WIN), hit(ik, WIN)]); redirect("/admin/login/verify?e=1");
  }
  await reset(ek); await clearPending2fa(); await createAdminSession(a.email, a.tokenVersion); redirect("/admin");
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (!(await getPending2fa())) redirect("/admin/login");
  const { e } = await searchParams;
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <form action={verify} className="card p-8 w-full max-w-sm space-y-4">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="text-center font-semibold uppercase tracking-widest text-sm">Two-step verification</h1>
        <p className="text-sm text-ink/70">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
        {e && <p role="alert" className="text-red-700 text-sm">{e === "locked" ? "Too many attempts. Try again in 15 minutes." : "That code didn't work. Try the next one."}</p>}
        <div><label className="label" htmlFor="code">Code</label><input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="text" className="input tracking-widest text-lg" /></div>
        <button className="btn btn-dark w-full">Verify</button>
      </form>
    </div>
  );
}
