import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { consumeToken, tokenIsValid } from "@/lib/customerAuth";
import { createCustomerSession } from "@/lib/session";

export const metadata = { title: "Choose a new password", robots: { index: false } };
async function reset(fd: FormData) {
  "use server";
  const token = String(fd.get("token") ?? ""); const pw = String(fd.get("password") ?? "");
  if (pw.length < 8 || pw.length > 100 || pw !== String(fd.get("confirm") ?? "")) redirect(`/account/reset?token=${token}&e=1`);
  const id = await consumeToken(token, "reset");
  if (!id) redirect("/account/reset?token=bad");
  // bumping tokenVersion signs out every other device; the reset also proves the customer owns the mailbox
  const [c] = await db.update(schema.customers).set({ passwordHash: await bcrypt.hash(pw, 11), tokenVersion: sql`${schema.customers.tokenVersion} + 1`, emailVerifiedAt: sql`coalesce(${schema.customers.emailVerifiedAt}, now())` })
    .where(eq(schema.customers.id, id)).returning();
  await createCustomerSession(c.id, c.tokenVersion); redirect("/account");
}
export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; e?: string }> }) {
  const { token = "", e } = await searchParams;
  const ok = await tokenIsValid(token, "reset");
  return (
    <div className="mx-auto max-w-md px-4 pt-14">
      <h1 className="section-title text-center">New password</h1>
      {!ok ? <div className="card p-7 mt-8 text-sm space-y-3" role="alert"><p>This reset link is invalid or has expired.</p><Link className="underline" href="/account/forgot">Request a new one</Link></div> : (
        <form action={reset} className="card p-7 mt-8 space-y-4">
          <input type="hidden" name="token" value={token} />
          {e && <p role="alert" className="text-red-700 text-sm">Passwords must match and be 8+ characters.</p>}
          <div><label className="label" htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" /></div>
          <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" minLength={8} required className="input" autoComplete="new-password" /></div>
          <button className="btn btn-dark w-full">Update password</button>
        </form>)}
    </div>
  );
}
