import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { consumeToken, tokenIsValid } from "@/lib/customerAuth";

export const metadata = { title: "Confirm email", robots: { index: false } };
// A button (POST) rather than auto-confirming on GET, so email scanners that pre-fetch links can't spend the token.
async function confirm(fd: FormData) {
  "use server";
  const id = await consumeToken(String(fd.get("token") ?? ""), "verify");
  if (!id) redirect("/account/verify?token=bad");
  await db.update(schema.customers).set({ emailVerifiedAt: sql`coalesce(${schema.customers.emailVerifiedAt}, now())` }).where(eq(schema.customers.id, id));
  redirect("/account?verified=1");
}
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams; const ok = await tokenIsValid(token, "verify");
  return (
    <div className="mx-auto max-w-md px-4 pt-14 text-center">
      <h1 className="section-title">Confirm your email</h1>
      {ok ? <form action={confirm} className="card p-7 mt-8 space-y-4"><input type="hidden" name="token" value={token} /><p className="text-sm">One click and your order history is unlocked.</p><button className="btn btn-gold">Confirm my email</button></form>
        : <div className="card p-7 mt-8 text-sm space-y-3" role="alert"><p>This link is invalid or has expired.</p><Link className="underline" href="/account">Go to your account to get a new one</Link></div>}
    </div>
  );
}
