import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { releaseStock } from "@/lib/orders";
import { mailOrderStatus } from "@/lib/mail";
import { naira } from "@/lib/money";

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

export default async function OrderDetail({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.number, number)); if (!o) notFound();
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id)).orderBy(desc(schema.payments.id));
  const proofs = await db.select().from(schema.paymentProofs).where(eq(schema.paymentProofs.orderId, o.id));
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

      <section className="card p-5"><h2 className="font-semibold mb-2">Internal note</h2>
        <form action={saveNote} className="flex gap-2"><input type="hidden" name="id" value={o.id} /><input name="note" defaultValue={o.adminNote ?? ""} className="input" maxLength={500} /><button className="btn btn-line">Save</button></form></section>
    </div>
  );
}
