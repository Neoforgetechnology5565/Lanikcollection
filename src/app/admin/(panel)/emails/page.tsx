import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { mailProvider, resendEmail, retryPendingEmails } from "@/lib/mail";

export const dynamic = "force-dynamic";
async function resend(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const id = Number(fd.get("id")); if (!id) return;
  await resendEmail(id);
  await db.insert(schema.auditLog).values({ actor: a.email, action: "email.resend", detail: `email ${id}` });
  revalidatePath("/admin/emails");
}
async function retryAll() { "use server"; await requireAdmin(); await retryPendingEmails(50); revalidatePath("/admin/emails"); }

export default async function Emails({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const rows = await db.select().from(schema.emails).orderBy(desc(schema.emails.id)).limit(80);
  const prov = mailProvider();
  const [shown] = open ? await db.select().from(schema.emails).where(eq(schema.emails.id, Number(open))) : [];
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3"><h1 className="font-serif text-3xl font-bold">Emails</h1><Link href="/admin/email-templates" className="btn btn-line !py-1.5">Edit templates</Link></div>
      <p className={`text-sm p-3 ${prov !== "none" ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}>
        {prov === "none" ? "No email provider configured. Messages are recorded here (QUEUED) but not delivered. Set RESEND_API_KEY, or SMTP_URL, plus MAIL_FROM." : `Delivering via ${prov.toUpperCase()}. Failed messages are retried automatically by the scheduled job (up to 5 attempts).`}</p>
      {prov !== "none" && <form action={retryAll}><button className="btn btn-dark !py-1.5">Retry all queued/failed now</button></form>}
      {shown && <div className="card p-4"><div className="flex justify-between"><p className="font-semibold">{shown.subject}</p><Link href="/admin/emails" className="text-xs underline">Close</Link></div>
        <iframe title="Email preview" sandbox="" srcDoc={shown.html} className="w-full h-96 mt-3 border border-champagne bg-white" /></div>}
      <div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Date", "To", "Subject", "Status", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((e) => <tr key={e.id} className="border-t border-champagne align-top"><td className="p-2 whitespace-nowrap">{e.createdAt.toLocaleString("en-NG")}</td><td className="p-2">{e.toAddress}</td>
          <td className="p-2"><Link className="underline" href={`/admin/emails?open=${e.id}`}>{e.subject}</Link><br /><span className="text-xs text-ink/50">{e.kind}</span></td>
          <td className="p-2 text-xs font-bold">{e.status}<span className="font-normal text-ink/50"> · {e.attempts} tries</span>{e.error && <span className="block font-normal text-red-700">{e.error}</span>}</td>
          <td className="p-2"><form action={resend}><input type="hidden" name="id" value={e.id} /><button className="btn btn-line !py-1 !px-3" disabled={prov === "none"}>Resend</button></form></td></tr>)}</tbody></table>
        {rows.length === 0 && <p className="p-4 text-sm text-ink/60">No emails yet.</p>}</div></div>
  );
}
