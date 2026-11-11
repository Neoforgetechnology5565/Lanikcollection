import { revalidatePath } from "next/cache";
import { desc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { campaignStats, queueCampaign } from "@/lib/newsletter";
import { deliver, mailProvider, retryPendingEmails } from "@/lib/mail";
import { campaignHtml, unsubscribeUrl } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const clean = (fd: FormData, k: string, n: number) => String(fd.get(k) ?? "").trim().slice(0, n);

async function sendTest(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const subject = clean(fd, "subject", 150), body = clean(fd, "body", 5000); if (!subject || !body) return;
  const html = campaignHtml(subject, body, clean(fd, "ctaLabel", 40) || null, clean(fd, "ctaUrl", 300) || null, unsubscribeUrl("0".repeat(36)));
  const [row] = await db.insert(schema.emails).values({ toAddress: a.email, subject: `[TEST] ${subject}`, html, kind: "campaign-test" }).returning();
  await deliver(row.id); revalidatePath("/admin/newsletter");
}
async function queue(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const subject = clean(fd, "subject", 150), body = clean(fd, "body", 5000);
  if (!subject || !body || fd.get("confirm") !== "on") return;
  const r = await queueCampaign({ subject, body, ctaLabel: clean(fd, "ctaLabel", 40), ctaUrl: clean(fd, "ctaUrl", 300), adminEmail: a.email });
  await db.insert(schema.auditLog).values({ actor: a.email, action: "campaign.queue", detail: `${r.queued} recipients: ${subject}` });
  revalidatePath("/admin/newsletter");
}
async function sendBatch() { "use server"; await requireAdmin(); await retryPendingEmails(30); revalidatePath("/admin/newsletter"); }
async function removeSubscriber(fd: FormData) { "use server"; await requireAdmin(); await db.delete(schema.subscribers).where(eq(schema.subscribers.email, String(fd.get("email")))); revalidatePath("/admin/newsletter"); }

export default async function Newsletter() {
  const [counts] = await db.select({ active: sql<number>`count(*) filter (where unsubscribed_at is null)::int`, off: sql<number>`count(*) filter (where unsubscribed_at is not null)::int` }).from(schema.subscribers);
  const subs = await db.select().from(schema.subscribers).orderBy(desc(schema.subscribers.createdAt)).limit(100);
  const camps = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.id)).limit(10);
  const stats = await campaignStats(); const prov = mailProvider();
  void isNull;
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-end justify-between flex-wrap gap-3"><h1 className="font-serif text-3xl font-bold">Newsletter</h1><Link className="btn btn-line !py-1.5" href="/api/admin/subscribers-csv">Export subscribers (CSV)</Link></div>
      <div className="grid grid-cols-2 gap-3 max-w-sm"><div className="card p-4"><p className="text-xs uppercase tracking-widest text-ink/60">Subscribed</p><p className="font-serif text-2xl font-bold">{counts.active}</p></div><div className="card p-4"><p className="text-xs uppercase tracking-widest text-ink/60">Unsubscribed</p><p className="font-serif text-2xl font-bold">{counts.off}</p></div></div>
      <p className={`text-sm p-3 ${prov !== "none" ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}>{prov === "none" ? "No email provider is set up, so campaigns are queued but cannot be sent yet. Add RESEND_API_KEY (or SMTP_URL) first." : `Sending through ${prov.toUpperCase()}. Campaigns go out in small batches every 5 minutes (about 40 per run), or press “Send next batch” to push 30 now.`}</p>

      <form className="card p-5 space-y-3">
        <h2 className="font-semibold">New campaign</h2>
        <div><label className="label" htmlFor="subject">Subject</label><input id="subject" name="subject" required maxLength={150} className="input" /></div>
        <div><label className="label" htmlFor="body">Message (blank line = new paragraph)</label><textarea id="body" name="body" required rows={7} maxLength={5000} className="input" /></div>
        <div className="grid sm:grid-cols-2 gap-3"><div><label className="label" htmlFor="ctaLabel">Button text (optional)</label><input id="ctaLabel" name="ctaLabel" maxLength={40} className="input" /></div><div><label className="label" htmlFor="ctaUrl">Button link (e.g. /shop?sale=1)</label><input id="ctaUrl" name="ctaUrl" maxLength={300} className="input" /></div></div>
        <label className="text-sm flex gap-2 items-start"><input type="checkbox" name="confirm" className="mt-1 accent-[#D99A24]" /><span>I confirm this goes only to people who chose to subscribe. Every email includes an unsubscribe link automatically.</span></label>
        <div className="flex gap-2 flex-wrap"><button formAction={sendTest} className="btn btn-line">Send a test to me</button><button formAction={queue} className="btn btn-gold" disabled={counts.active === 0}>Queue for {counts.active} subscriber{counts.active === 1 ? "" : "s"}</button></div>
      </form>

      <section className="card p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Campaigns</h2>{prov !== "none" && <form action={sendBatch}><button className="btn btn-dark !py-1.5">Send next batch now</button></form>}</div>
        {camps.length === 0 ? <p className="text-sm text-ink/60 mt-2">None yet.</p> : <table className="w-full text-sm mt-3"><thead className="text-left text-xs uppercase text-ink/50"><tr><th className="py-1">Subject</th><th>Date</th><th>Recipients</th><th>Sent</th><th>Waiting</th><th>Failed</th><th>Skipped</th></tr></thead>
          <tbody>{camps.map((c) => { const s = stats.get(c.id) ?? {}; return <tr key={c.id} className="border-t border-champagne"><td className="py-1.5">{c.subject}</td><td className="text-xs">{c.createdAt.toLocaleDateString("en-NG")}</td><td>{c.recipients}</td><td>{s.SENT ?? 0}</td><td>{(s.QUEUED ?? 0)}</td><td>{s.FAILED ?? 0}</td><td>{s.SKIPPED ?? 0}</td></tr>; })}</tbody></table>}</section>

      <section className="card"><h2 className="font-semibold p-4 pb-2">Subscribers (latest 100)</h2>
        <table className="w-full text-sm"><tbody>{subs.map((s) => <tr key={s.email} className="border-t border-champagne"><td className="p-2">{s.email}</td><td className="p-2 text-xs text-ink/60">{s.unsubscribedAt ? `unsubscribed ${s.unsubscribedAt.toLocaleDateString("en-NG")}` : `since ${s.createdAt.toLocaleDateString("en-NG")}`}</td><td className="p-2 text-right"><form action={removeSubscriber}><input type="hidden" name="email" value={s.email} /><button className="text-xs text-red-700 underline">Remove</button></form></td></tr>)}</tbody></table>
        {subs.length === 0 && <p className="p-4 text-sm text-ink/60">No subscribers yet. The sign-up box is in the footer and on the homepage.</p>}</section>
    </div>
  );
}
