import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
export const dynamic = "force-dynamic";
export default async function Emails() {
  const rows = await db.select().from(schema.emails).orderBy(desc(schema.emails.id)).limit(60);
  const smtp = !!process.env.SMTP_URL;
  return (
    <div className="space-y-4"><h1 className="font-serif text-3xl font-bold">Emails</h1>
      <p className={`text-sm p-3 ${smtp ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}>{smtp ? "SMTP is configured: messages below are delivered." : "SMTP_URL is not set, so emails are only recorded here (status QUEUED) and not delivered. Set SMTP_URL and MAIL_FROM to start sending."}</p>
      <div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Date", "To", "Subject", "Status"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((e) => <tr key={e.id} className="border-t border-champagne"><td className="p-2 whitespace-nowrap">{e.createdAt.toLocaleString("en-NG")}</td><td className="p-2">{e.toAddress}</td><td className="p-2">{e.subject}</td><td className="p-2 text-xs font-bold">{e.status}{e.error && <span className="block font-normal text-red-700">{e.error}</span>}</td></tr>)}</tbody></table>
        {rows.length === 0 && <p className="p-4 text-sm text-ink/60">No emails yet.</p>}</div></div>
  );
}
