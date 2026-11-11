import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { flwConfig, flwRaw } from "@/lib/flutterwave";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";
type Diag = { at: string; kind: string; ok: boolean; status: number | null; summary: string; body: string };

async function save(d: Diag) {
  await db.insert(schema.settings).values({ key: "diag_last", value: d }).onConflictDoUpdate({ target: schema.settings.key, set: { value: d } });
  revalidatePath("/admin/payments/diagnostics");
}
// responses never contain our keys, but scrub the secret anyway and cap the size
const dump = (b: unknown) => { let s = JSON.stringify(b, null, 2) ?? String(b); const k = process.env.FLW_SECRET_KEY; if (k) s = s.split(k).join("[hidden]"); return s.slice(0, 6000); };

async function checkKeys() {
  "use server"; await requireAdmin();
  try {
    flwConfig();
    const r = await flwRaw("/banks/NG"); const body = r.body as { status?: string; message?: string; data?: unknown[] };
    const ok = r.status === 200 && body?.status === "success";
    await save({ at: new Date().toISOString(), kind: "Check keys", ok, status: r.status, summary: ok ? `Keys work. Flutterwave listed ${Array.isArray(body.data) ? body.data.length : "?"} Nigerian banks.` : `Flutterwave said: ${body?.message ?? r.status}. Check FLW_SECRET_KEY and that FLW_MODE matches the key type.`, body: dump(r.body).slice(0, 1500) });
  } catch (e) { await save({ at: new Date().toISOString(), kind: "Check keys", ok: false, status: null, summary: (e as Error).message, body: "" }); }
}
/** Sandbox only: asks for a one-off ₦100 virtual account so we can see the real response shape. Disabled in live mode (it would create a real account). */
async function testVirtualAccount() {
  "use server"; const a = await requireAdmin();
  try {
    const cfg = flwConfig(); if (cfg.mode !== "sandbox") throw new Error("Only available in sandbox mode, so it never creates a real account.");
    const tx = `DIAG-${randomBytes(4).toString("hex")}`;
    const r = await flwRaw("/charges?type=bank_transfer", { method: "POST", body: JSON.stringify({ tx_ref: tx, amount: 100, currency: "NGN", email: a.email, fullname: "Diagnostics", phone_number: "08000000000", is_permanent: false, narration: "LANIK diagnostics" }) });
    const auth = (r.body as any)?.meta?.authorization;
    const ok = r.status === 200 && !!(auth?.transfer_account ?? auth?.account_number);
    const exp = auth?.account_expiration;
    await save({ at: new Date().toISOString(), kind: "Test bank-transfer account (sandbox)", ok, status: r.status,
      summary: ok ? `Got account ${auth.transfer_account ?? auth.account_number} at ${auth.transfer_bank ?? auth.bank_name}. Expiry from Flutterwave: ${exp ? `"${exp}"` : "none given"}. Account name field: ${auth.transfer_account_name ?? auth.account_name ?? "none (the business name is shown instead)"}.` : `Flutterwave didn't return an account (${(r.body as any)?.message ?? r.status}). Your account may not have bank transfer enabled.`, body: dump(r.body) });
  } catch (e) { await save({ at: new Date().toISOString(), kind: "Test bank-transfer account (sandbox)", ok: false, status: null, summary: (e as Error).message, body: "" }); }
}

export default async function Diagnostics() {
  let mode = "", cfgErr = ""; try { mode = flwConfig().mode; } catch (e) { cfgErr = (e as Error).message; }
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "diag_last")); const last = row?.value as Diag | undefined;
  const hooks = await db.select().from(schema.webhookEvents).orderBy(desc(schema.webhookEvents.id)).limit(15);
  const failed = await db.select({ p: schema.payments, n: schema.orders.number }).from(schema.payments).innerJoin(schema.orders, eq(schema.orders.id, schema.payments.orderId)).where(eq(schema.payments.status, "FAILED")).orderBy(desc(schema.payments.id)).limit(8);
  return (
    <div className="space-y-6 max-w-4xl">
      <div><Link href="/admin/payments" className="text-xs uppercase tracking-widest underline">← Payments</Link><h1 className="font-serif text-3xl font-bold mt-1">Payment diagnostics</h1>
        <p className="text-sm text-ink/70">Use this while setting up Flutterwave. It shows exactly what Flutterwave answers, so problems can be fixed quickly.</p></div>
      <section className="card p-5 text-sm space-y-1">
        <p>Mode: {cfgErr ? <b className="text-red-700">{cfgErr}</b> : <b>{mode.toUpperCase()}</b>}</p>
        <p>Webhook secret hash: {process.env.FLW_SECRET_HASH ? "set" : <b className="text-red-700">missing</b>}</p>
        <p>Webhook URL to enter in Flutterwave: <code className="bg-champagne/60 px-1">{siteUrl()}/api/webhooks/flutterwave</code></p>
        <div className="flex gap-2 pt-2 flex-wrap"><form action={checkKeys}><button className="btn btn-dark !py-1.5">Check my keys</button></form>
          <form action={testVirtualAccount}><button className="btn btn-line !py-1.5" disabled={mode !== "sandbox"}>Try a test bank-transfer account</button></form></div>
        {mode === "live" && <p className="text-xs text-ink/50">The bank-transfer test is sandbox-only so it can't create a real account.</p>}
      </section>
      {last && <section className={`card p-5 ${last.ok ? "border-green-300" : "border-red-300"}`}><p className="font-semibold">{last.kind}: {last.ok ? "OK" : "Problem"} <span className="text-xs font-normal text-ink/50">{new Date(last.at).toLocaleString("en-NG")}</span></p><p className="text-sm mt-1">{last.summary}</p>
        {last.body && <details className="mt-3"><summary className="text-xs underline cursor-pointer">Raw response (safe to send to your developer)</summary><pre className="mt-2 text-xs bg-ink text-champagne p-3 overflow-x-auto max-h-80">{last.body}</pre></details>}</section>}
      <section className="card p-5"><h2 className="font-semibold mb-2">Recent webhook calls from Flutterwave</h2>
        {hooks.length === 0 ? <p className="text-sm text-ink/60">None yet. After a test payment, a call should appear here. If it doesn't, the webhook URL or secret hash in Flutterwave is wrong.</p> :
          <ul className="divide-y divide-champagne text-xs">{hooks.map((h) => <li key={h.id} className="py-2"><b>{h.eventKey}</b> · {h.txRef} · {h.receivedAt.toLocaleString("en-NG")}</li>)}</ul>}</section>
      <section className="card p-5"><h2 className="font-semibold mb-2">Recent failed payment attempts</h2>
        {failed.length === 0 ? <p className="text-sm text-ink/60">None.</p> : <ul className="divide-y divide-champagne text-sm">{failed.map(({ p, n }) => <li key={p.id} className="py-2"><b>{n}</b> · {p.method} · <span className="text-red-800">{p.failureReason}</span></li>)}</ul>}</section>
    </div>
  );
}
