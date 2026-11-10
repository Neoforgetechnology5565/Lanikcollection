import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { releaseStock } from "@/lib/orders";
import { mailOrderStatus } from "@/lib/mail";
import { naira, toKobo } from "@/lib/money";
import { createRefund, refundedSoFar, RefundError } from "@/lib/refunds";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
// PAID is deliberately absent: only verified payment or an approved receipt can make an order PAID.
const SETTABLE = ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

async function setStatus(fd: FormData) {
  "use server";
  const a = await requireAdmin();
  const status = SETTABLE.find((s) => s === fd.get("status")); const id = Number(fd.get("id"));
  if (!status || !id) return;
  const changed = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id)).for("update");
    if (!o) return false;
    const paid = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(o.status);
    if (status !== "CANCELLED" && !paid) return false;
    if (status === "CANCELLED" && paid && fd.get("confirm") !== "on") return false; // cancelling a paid order needs an explicit tick
    await tx.update(schema.orders).set({ status }).where(eq(schema.orders.id, id));
    if (status === "CANCELLED") await releaseStock(tx, id);
    await tx.insert(schema.auditLog).values({ actor: a.email, action: "order.status", detail: `${o.number}: ${o.status} → ${status}` });
    return true;
  });
  if (changed) await mailOrderStatus(id);
  revalidatePath("/admin/orders", "layout");
}
async function saveNote(fd: FormData) {
  "use server"; const a = await requireAdmin();
  await db.update(schema.orders).set({ adminNote: String(fd.get("note") ?? "").slice(0, 500) || null }).where(eq(schema.orders.id, Number(fd.get("id"))));
  await db.insert(schema.auditLog).values({ actor: a.email, action: "order.note", detail: `order ${fd.get("id")}` });
  revalidatePath("/admin/orders", "layout");
}

async function refund(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const number = String(fd.get("number")); const method = fd.get("method") === "flutterwave" ? "flutterwave" : "manual";
  try {
    await createRefund({ paymentId: Number(fd.get("paymentId")), amountKobo: toKobo(Number(fd.get("amount"))), reason: String(fd.get("reason") ?? ""), method, adminEmail: a.email, reference: String(fd.get("reference") ?? "") });
  } catch (e) { if (e instanceof RefundError) redirect(`/admin/orders/${number}?refundError=${encodeURIComponent(e.message)}`); throw e; }
  revalidatePath("/admin/orders", "layout"); redirect(`/admin/orders/${number}?refunded=1`);
}

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ refundError?: string; refunded?: string }> }) {
  const { number } = await params; const sp = await searchParams;
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, number)); if (!o) notFound();
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id)).orderBy(desc(schema.payments.id));
  const proofs = await db.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.orderId, o.id));
  const refunds = await db.select().from(schema.refunds).where(eq(schema.refunds.orderId, o.id)).orderBy(desc(schema.refunds.id));
  const refundable = await Promise.all(pays.filter((p) => ["SUCCESSFUL", "REVIEW"].includes(p.status) && p.paidAmountKobo != null).map(async (p) => ({ p, left: (p.paidAmountKobo ?? 0) - (await refundedSoFar(p.id)) })));
  const paid = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(o.status);
  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/admin/orders" className="text-xs uppercase tracking-widest underline">← Orders</Link>
      <div className="flex items-end justify-between flex-wrap gap-3"><div><p className="eyebrow">Order</p><h1 className="font-serif text-3xl font-bold">{o.number}</h1><p className="text-sm text-ink/60">{o.createdAt.toLocaleString("en-NG")}</p></div>
        <span className="font-bold tracking-widest text-sm bg-ink text-gold-light px-3 py-1.5">{o.status}</span></div>
      {o.status === "REVIEW" && <p className="bg-orange-50 border border-orange-300 text-orange-900 p-3 text-sm"><b>Needs your attention.</b> {o.adminNote}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <section className="card p-5 text-sm space-y-1"><h2 className="font-semibold mb-2">Customer &amp; delivery</h2><p><b>{o.customerName}</b></p><p>{o.email}</p><p>{o.phone}</p><p>{o.address}, {o.city}, {o.state}</p>{o.notes && <p className="text-ink/70">Note: {o.notes}</p>}</section>
        <section className="card p-5 text-sm space-y-3"><h2 className="font-semibold">Fulfilment</h2>
          {paid || o.status === "AWAITING_PAYMENT" || o.status === "EXPIRED" || o.status === "REVIEW" ? (
            <form action={setStatus} className="space-y-2"><input type="hidden" name="id" value={o.id} />
              <select name="status" className="input">{SETTABLE.map((s) => <option key={s}>{s}</option>)}</select>
              <label className="text-xs flex gap-2"><input type="checkbox" name="confirm" /> I confirm (required to cancel a paid order; stock is released, refund is manual in Flutterwave)</label>
              <button className="btn btn-dark">Update status &amp; notify customer</button></form>) : <p className="text-ink/60">No further actions.</p>}
          {!paid && <p className="text-xs text-ink/60">Orders can only be fulfilled after payment is verified.</p>}</section>
      </div>

      <section className="card p-5"><h2 className="font-semibold mb-2">Items</h2>
        <table className="w-full text-sm"><tbody>{items.map((i) => <tr key={i.id} className="border-t border-champagne first:border-0"><td className="py-1.5">{i.name} <span className="text-ink/50">{[i.size, i.color].filter(Boolean).join(" · ")}</span></td><td>×{i.qty}</td><td className="text-right">{naira(i.unitKobo * i.qty)}</td></tr>)}</tbody></table>
        <div className="mt-3 border-t border-champagne pt-3 text-sm space-y-1"><p className="flex justify-between"><span>Subtotal</span><span>{naira(o.subtotalKobo)}</span></p>{o.discountKobo > 0 && <p className="flex justify-between"><span>Discount {o.discountCode}</span><span>−{naira(o.discountKobo)}</span></p>}<p className="flex justify-between"><span>Shipping</span><span>{naira(o.shippingKobo)}</span></p><p className="flex justify-between font-bold text-base"><span>Total</span><span>{naira(o.totalKobo)}</span></p></div></section>

      <section className="card p-5"><h2 className="font-semibold mb-2">Payments</h2>
        {pays.length === 0 ? <p className="text-sm text-ink/60">No payment attempts.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs uppercase text-ink/50"><tr><th className="py-1">Method</th><th>Reference</th><th>Status</th><th>Confirmed</th><th>Virtual account</th></tr></thead>
          <tbody>{pays.map((p) => <tr key={p.id} className="border-t border-champagne align-top"><td className="py-1.5">{p.method}</td><td className="font-mono text-xs break-all">{p.txRef}</td><td className="font-bold text-xs">{p.status}{(p.note || p.failureReason) && <span className="block font-normal text-ink/60">{p.note ?? p.failureReason}</span>}</td><td>{p.paidAmountKobo != null ? naira(p.paidAmountKobo) : "—"}</td><td className="text-xs">{p.vaAccountNumber ? `${p.vaBank} ${p.vaAccountNumber}` : "—"}</td></tr>)}</tbody></table></div>}
        {proofs.length > 0 && <p className="mt-3 text-sm">Receipts: {proofs.map((r) => <a key={r.id} className="underline mr-3" target="_blank" href={`/api/admin/receipt/${r.fileName}`}>{r.reference} ({r.status})</a>)} · <Link className="underline" href="/admin/receipts">review</Link></p>}</section>

      {(refundable.length > 0 || refunds.length > 0) && <section className="card p-5 space-y-4"><h2 className="font-semibold">Refunds</h2>
        {sp.refundError && <p role="alert" className="bg-red-50 border border-red-300 text-red-900 p-3 text-sm">{sp.refundError}</p>}
        {sp.refunded && <p role="status" className="bg-green-50 border border-green-300 text-green-900 p-3 text-sm">Refund recorded.</p>}
        {refunds.length > 0 && <table className="w-full text-sm"><tbody>{refunds.map((r) => <tr key={r.id} className="border-t border-champagne first:border-0"><td className="py-1.5">{r.createdAt.toLocaleDateString("en-NG")}</td><td>{naira(r.amountKobo)}</td><td className="text-xs">{r.method}{r.providerRef && ` · ${r.providerRef}`}</td><td className="font-bold text-xs">{r.status}{r.error && <span className="block font-normal text-red-700">{r.error}</span>}</td><td className="text-xs text-ink/60">{r.reason}</td></tr>)}</tbody></table>}
        {refundable.filter((x) => x.left > 0).map(({ p, left }) => (
          <form key={p.id} action={refund} className="border-t border-champagne pt-3 grid sm:grid-cols-2 gap-2 text-sm"><input type="hidden" name="number" value={o.number} /><input type="hidden" name="paymentId" value={p.id} />
            <p className="sm:col-span-2"><b>{p.method}</b> payment {p.txRef}: up to <b>{naira(left)}</b> refundable</p>
            <div><label className="label">Amount ₦</label><input name="amount" type="number" step="0.01" min="0.01" max={left / 100} defaultValue={left / 100} className="input" required /></div>
            <div><label className="label">How</label><select name="method" className="input" defaultValue={p.provider === "flutterwave" && p.providerTxId ? "flutterwave" : "manual"}>{p.provider === "flutterwave" && p.providerTxId && <option value="flutterwave">Refund via Flutterwave</option>}<option value="manual">I refunded it myself (record only)</option></select></div>
            <div><label className="label">Reason</label><input name="reason" className="input" maxLength={300} required /></div>
            <div><label className="label">Reference (manual)</label><input name="reference" className="input" maxLength={120} /></div>
            <p className="text-xs text-ink/60 sm:col-span-2">A full refund cancels an unshipped order and releases its stock.</p>
            <div className="sm:col-span-2"><button className="btn btn-dark">Record refund</button></div></form>))}</section>}

      <section className="card p-5"><h2 className="font-semibold mb-2">Internal note</h2>
        <form action={saveNote} className="flex gap-2"><input type="hidden" name="id" value={o.id} /><input name="note" defaultValue={o.adminNote ?? ""} className="input" maxLength={500} /><button className="btn btn-line">Save</button></form></section>
    </div>
  );
}
