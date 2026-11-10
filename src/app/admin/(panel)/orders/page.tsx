import { revalidatePath } from "next/cache";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { releaseStock } from "@/lib/orders";
import { naira } from "@/lib/money";

export const dynamic = "force-dynamic";
// PAID is deliberately absent: an order becomes PAID only through verified payment or an approved receipt.
const SETTABLE = ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

async function setStatus(fd: FormData) {
  "use server";
  const a = await requireAdmin();
  const status = SETTABLE.find((s) => s === fd.get("status")); const id = Number(fd.get("id"));
  if (!status || !id) return;
  await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, id)).for("update");
    if (!o) return;
    const paid = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(o.status);
    if (status !== "CANCELLED" && !paid) return; // can't fulfil an unpaid order
    await tx.update(schema.orders).set({ status }).where(eq(schema.orders.id, id));
    if (status === "CANCELLED") await releaseStock(tx, id);
    await tx.insert(schema.auditLog).values({ actor: a.email, action: "order.status", detail: `${o.number}: ${o.status} → ${status}` });
  });
  revalidatePath("/admin/orders");
}

export default async function Orders({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await db.select().from(schema.orders)
    .where(q ? or(ilike(schema.orders.number, `%${q}%`), ilike(schema.orders.customerName, `%${q}%`), ilike(schema.orders.email, `%${q}%`)) : undefined)
    .orderBy(desc(schema.orders.id)).limit(100);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl font-bold">Orders</h1>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search order no., name or email" className="input max-w-sm" /><button className="btn btn-dark">Search</button></form>
      <div className="overflow-x-auto card"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr>{["Order", "Customer", "Total", "Status", "Note", "Update"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((o) => (
          <tr key={o.id} className="border-t border-champagne align-top">
            <td className="p-2"><b>{o.number}</b><br /><span className="text-xs text-ink/60">{o.createdAt.toLocaleString("en-NG")}</span></td>
            <td className="p-2">{o.customerName}<br /><span className="text-xs">{o.phone} · {o.city}, {o.state}</span></td>
            <td className="p-2">{naira(o.totalKobo)}</td>
            <td className="p-2 font-semibold">{o.status}</td>
            <td className="p-2 text-xs max-w-56">{o.adminNote}</td>
            <td className="p-2"><form action={setStatus} className="flex gap-1"><input type="hidden" name="id" value={o.id} />
              <select name="status" className="input !py-1 !px-2 !w-auto">{SETTABLE.map((s) => <option key={s}>{s}</option>)}</select><button className="btn btn-line !py-1 !px-3">Set</button></form></td>
          </tr>))}</tbody></table></div>
    </div>
  );
}
