import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { approveManualProof, rejectManualProof } from "@/lib/payments";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";

async function approve(fd: FormData) { "use server"; const a = await requireAdmin(); try { await approveManualProof(Number(fd.get("id")), a.email); } catch { /* shown by status on reload */ } revalidatePath("/admin/receipts"); }
async function reject(fd: FormData) { "use server"; const a = await requireAdmin(); await rejectManualProof(Number(fd.get("id")), a.email, String(fd.get("reason") || "Not verified").slice(0, 200)).catch(() => {}); revalidatePath("/admin/receipts"); }

export default async function Receipts() {
  const rows = await db.select({ pr: schema.paymentProofs, o: schema.orders }).from(schema.paymentProofs)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.paymentProofs.orderId)).orderBy(desc(schema.paymentProofs.id)).limit(100);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl font-bold">Manual payment receipts</h1>
      <p className="text-sm text-ink/70">Check each transfer against your bank statement before approving. A receipt image alone proves nothing.</p>
      {rows.length === 0 && <p className="text-ink/60">No receipts submitted.</p>}
      {rows.map(({ pr, o }) => (
        <div key={pr.id} className="card p-4 grid md:grid-cols-[1fr_auto] gap-4">
          <div className="text-sm space-y-1">
            <p><b>{o.number}</b> · {o.customerName} · order total <b>{naira(o.totalKobo)}</b> · order status {o.status}</p>
            <p>Declared amount <b>{naira(pr.amountKobo)}</b>{pr.amountKobo < o.totalKobo && <span className="text-red-700 font-bold"> (less than total)</span>} · reference <span className="font-mono">{pr.reference}</span></p>
            <p><a className="underline" target="_blank" rel="noopener" href={`/api/admin/receipt/${pr.fileName}`}>Open receipt</a> · submitted {pr.createdAt.toLocaleString("en-NG")}</p>
            <p>Status: <b>{pr.status}</b>{pr.reviewedBy && ` by ${pr.reviewedBy}`}{pr.reviewNote && ` (${pr.reviewNote})`}</p>
          </div>
          {pr.status === "PENDING" && <div className="flex flex-col gap-2">
            <form action={approve}><input type="hidden" name="id" value={pr.id} /><button className="btn btn-gold w-full">Approve &amp; mark paid</button></form>
            <form action={reject} className="flex gap-2"><input type="hidden" name="id" value={pr.id} /><input name="reason" placeholder="Reason" className="input !py-1.5" /><button className="btn btn-line">Reject</button></form>
          </div>}
        </div>))}
    </div>
  );
}
