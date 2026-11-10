import Link from "next/link";
import { revalidatePath } from "next/cache";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { setRefundStatus, RefundError } from "@/lib/refunds";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
async function mark(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const status = fd.get("status") === "FAILED" ? "FAILED" : "PROCESSED";
  try { await setRefundStatus(Number(fd.get("id")), status, a.email); } catch (e) { if (!(e instanceof RefundError)) throw e; }
  revalidatePath("/admin/refunds");
}
export default async function Refunds() {
  const rows = await db.select({ r: schema.refunds, number: schema.orders.number }).from(schema.refunds).innerJoin(schema.orders, eq(schema.orders.id, schema.refunds.orderId)).orderBy(desc(schema.refunds.id)).limit(150);
  // money we hold that probably has to go back: flagged payments and cancelled-but-paid orders with nothing refunded yet
  const attention = await db.execute(sql`
    SELECT o.number, o.status, p.status AS pstatus, p.note, COALESCE(p.paid_amount_kobo, p.amount_kobo) AS paid
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE (p.status = 'REVIEW' OR (o.status = 'CANCELLED' AND p.status = 'SUCCESSFUL'))
      AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_id = p.id AND r.status IN ('REQUESTED','PROCESSED'))
    ORDER BY p.id DESC LIMIT 50`);
  const pending = rows.filter((x) => x.r.status === "REQUESTED").reduce((a, x) => a + x.r.amountKobo, 0);
  const done = rows.filter((x) => x.r.status === "PROCESSED").reduce((a, x) => a + x.r.amountKobo, 0);
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">Refunds</h1>
      <div className="grid grid-cols-2 gap-3 max-w-md"><div className="card p-4"><p className="text-xs uppercase tracking-widest text-ink/60">Refunded</p><p className="font-serif text-2xl font-bold">{naira(done)}</p></div><div className="card p-4"><p className="text-xs uppercase tracking-widest text-ink/60">Pending</p><p className="font-serif text-2xl font-bold">{naira(pending)}</p></div></div>
      {attention.rows.length > 0 && <section className="card p-5 border-orange-300"><h2 className="font-semibold">May need a refund</h2><p className="text-xs text-ink/60 mb-2">Payments flagged for review (duplicate, under/over-paid, late with no stock) and cancelled orders that were paid.</p>
        <ul className="divide-y divide-champagne text-sm">{(attention.rows as { number: string; status: string; pstatus: string; note: string | null; paid: string }[]).map((x) => <li key={x.number + x.pstatus} className="py-2 flex flex-wrap gap-x-4 justify-between"><Link className="underline font-semibold" href={`/admin/orders/${x.number}`}>{x.number}</Link><span>{naira(Number(x.paid))}</span><span className="text-xs text-ink/60 flex-1 min-w-48">{x.note ?? `order ${x.status.toLowerCase()}`}</span></li>)}</ul></section>}
      <div className="card overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Date", "Order", "Amount", "How", "Status", "Reason", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map(({ r, number }) => <tr key={r.id} className="border-t border-champagne align-top"><td className="p-2 whitespace-nowrap">{r.createdAt.toLocaleString("en-NG")}</td><td className="p-2"><Link className="underline" href={`/admin/orders/${number}`}>{number}</Link></td><td className="p-2">{naira(r.amountKobo)}</td><td className="p-2 text-xs">{r.method}{r.providerRef && <><br />{r.providerRef}</>}<br />by {r.createdBy}</td>
          <td className="p-2 font-bold text-xs">{r.status}{r.error && <span className="block font-normal text-red-700">{r.error}</span>}</td><td className="p-2 text-xs">{r.reason}</td>
          <td className="p-2">{r.status === "REQUESTED" && <form action={mark} className="flex gap-1"><input type="hidden" name="id" value={r.id} /><button name="status" value="PROCESSED" className="btn btn-line !py-1 !px-2 text-[10px]">Mark paid out</button><button name="status" value="FAILED" className="text-xs text-red-700 underline">Failed</button></form>}</td></tr>)}</tbody></table>
        {rows.length === 0 && <p className="p-4 text-sm text-ink/60">No refunds recorded.</p>}</div>
    </div>
  );
}
