import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSettings, saveSettings, clampExpiry, METHODS, METHOD_LABELS } from "@/lib/settings";
import { db, schema } from "@/db";
import { flwConfig } from "@/lib/flutterwave";

export const dynamic = "force-dynamic";

async function save(fd: FormData) {
  "use server";
  const a = await requireAdmin();
  const cur = await getSettings();
  const enabledMethods = Object.fromEntries(METHODS.map((m) => [m, fd.get(`m_${m}`) === "on"])) as typeof cur.enabledMethods;
  await saveSettings({
    ...cur, enabledMethods,
    transferExpiryMinutes: clampExpiry(Number(fd.get("expiryHours")) * 60),
    onlineWindowMinutes: Math.min(1440, Math.max(15, Number(fd.get("onlineWindow")) || 60)),
    bank: { bankName: String(fd.get("bankName") ?? "").trim(), accountName: String(fd.get("accountName") ?? "").trim(), accountNumber: String(fd.get("accountNumber") ?? "").trim(), instructions: String(fd.get("instructions") ?? "").trim() },
    shippingFlatKobo: Math.max(0, Math.round(Number(fd.get("shipping")) * 100) || 0),
    whatsapp: String(fd.get("whatsapp") ?? "").trim(),
  });
  await db.insert(schema.auditLog).values({ actor: a.email, action: "settings.save", detail: "payment/site settings" });
  revalidatePath("/", "layout");
}

export default async function SettingsPage() {
  const s = await getSettings();
  let mode = "", cfgErr = "";
  try { mode = flwConfig().mode; } catch (e) { cfgErr = e instanceof Error ? e.message : "misconfigured"; }
  const hashSet = !!process.env.FLW_SECRET_HASH;
  const appUrl = process.env.APP_URL ?? "https://YOUR-DOMAIN";
  return (
    <form action={save} className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-3xl font-bold">Payment &amp; site settings</h1>

      <section className="card p-5 space-y-2 text-sm">
        <h2 className="font-semibold">Flutterwave connection</h2>
        {cfgErr ? <p className="text-red-700">⚠ {cfgErr}. Online payment methods are hidden from customers until this is fixed.</p> : <p>Mode: <b>{mode.toUpperCase()}</b> {mode === "sandbox" && "(test keys: no real money moves)"}</p>}
        <p>Webhook secret hash: {hashSet ? "configured" : <span className="text-red-700">missing: webhooks will be rejected</span>}</p>
        <p className="text-ink/70">In Flutterwave Dashboard → Settings → Webhooks set the URL to <code className="bg-champagne/60 px-1">{appUrl}/api/webhooks/flutterwave</code> and the secret hash to your <code>FLW_SECRET_HASH</code>. Keys are read from environment variables only and are never shown here.</p>
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold">Enabled payment methods</h2>
        <p className="text-xs text-ink/60">Customers only see methods that are enabled here <i>and</i> working. If Flutterwave rejects a channel your merchant account doesn&apos;t have, the customer is told it&apos;s unavailable and the failure is recorded in Payments. Untick it here to hide it.</p>
        {METHODS.map((m) => <label key={m} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`m_${m}`} defaultChecked={s.enabledMethods[m]} className="accent-[#D99A24]" />{METHOD_LABELS[m]}</label>)}
      </section>

      <section className="card p-5 grid sm:grid-cols-2 gap-4">
        <div><label className="label" htmlFor="expiryHours">Bank-transfer account expiry (hours, 1–3)</label>
          <input id="expiryHours" name="expiryHours" type="number" min={1} max={3} step={0.5} defaultValue={s.transferExpiryMinutes / 60} className="input" />
          <p className="text-xs text-ink/60 mt-1">If Flutterwave closes the account sooner than this, the shorter time is used and shown to the customer.</p></div>
        <div><label className="label" htmlFor="onlineWindow">Card / USSD / OPay / QR window (minutes)</label>
          <input id="onlineWindow" name="onlineWindow" type="number" min={15} max={1440} defaultValue={s.onlineWindowMinutes} className="input" /></div>
        <div><label className="label" htmlFor="shipping">Flat shipping fee (₦)</label><input id="shipping" name="shipping" type="number" min={0} step="0.01" defaultValue={s.shippingFlatKobo / 100} className="input" /></div>
        <div><label className="label" htmlFor="whatsapp">WhatsApp number (international, e.g. 2348012345678)</label><input id="whatsapp" name="whatsapp" defaultValue={s.whatsapp} className="input" /></div>
      </section>

      <section className="card p-5 grid sm:grid-cols-2 gap-4">
        <h2 className="font-semibold sm:col-span-2">Manual bank transfer details (shown only if Manual Transfer is enabled)</h2>
        <div><label className="label" htmlFor="bankName">Bank</label><input id="bankName" name="bankName" defaultValue={s.bank.bankName} className="input" /></div>
        <div><label className="label" htmlFor="accountName">Account name</label><input id="accountName" name="accountName" defaultValue={s.bank.accountName} className="input" /></div>
        <div><label className="label" htmlFor="accountNumber">Account number</label><input id="accountNumber" name="accountNumber" defaultValue={s.bank.accountNumber} className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="instructions">Instructions</label><textarea id="instructions" name="instructions" rows={2} defaultValue={s.bank.instructions} className="input" /></div>
      </section>
      <button className="btn btn-dark">Save settings</button>
    </form>
  );
}
