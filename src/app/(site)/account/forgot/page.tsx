import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientIp, limited } from "@/lib/ratelimit";
import { issueToken, appUrl } from "@/lib/customerAuth";
import { mailPasswordReset } from "@/lib/mail";

export const metadata = { title: "Forgot password" };
async function request(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const over = (await limited(`forgot:email:${email}`, 3, 3600)) || (await limited(`forgot:ip:${await clientIp()}`, 15, 3600));
  if (!over && email) {
    const [c] = await db.select().from(schema.customers).where(eq(schema.customers.email, email));
    if (c) await mailPasswordReset(c.email, c.name, `${appUrl()}/account/reset?token=${await issueToken(c.id, "reset", 60)}`);
  }
  redirect("/account/forgot?sent=1"); // identical response whether or not the account exists
}
export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 pt-14">
      <p className="eyebrow text-center">No worries</p><h1 className="section-title text-center mt-2">Reset password</h1>
      {sent ? <div className="card p-7 mt-8 text-sm space-y-3" role="status"><p>If an account exists for that email, we&apos;ve sent a reset link. It expires in 1 hour.</p><Link href="/account/login" className="underline">Back to sign in</Link></div> : (
        <form action={request} className="card p-7 mt-8 space-y-4">
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
          <button className="btn btn-dark w-full">Email me a reset link</button>
        </form>)}
    </div>
  );
}
