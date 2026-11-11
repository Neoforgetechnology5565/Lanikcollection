import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/newsletter";

export const metadata = { title: "Unsubscribe", robots: { index: false } };
async function confirm(fd: FormData) {
  "use server";
  const ok = await unsubscribeByToken(String(fd.get("token") ?? ""));
  redirect(ok ? "/unsubscribe?done=1" : "/unsubscribe?bad=1");
}
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ token?: string; done?: string; bad?: string }> }) {
  const { token = "", done, bad } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 pt-14 text-center">
      <h1 className="section-title">Unsubscribe</h1>
      {done ? <p className="card p-7 mt-8" role="status">You've been unsubscribed. You won't get any more marketing emails from us.</p>
        : bad ? <p className="card p-7 mt-8" role="alert">That link isn't valid.</p>
        : <form action={confirm} className="card p-7 mt-8 space-y-4"><input type="hidden" name="token" value={token} /><p className="text-sm">Stop receiving news and offers from LANIK COLLECTIONS?</p><button className="btn btn-dark">Yes, unsubscribe me</button></form>}
    </div>
  );
}
