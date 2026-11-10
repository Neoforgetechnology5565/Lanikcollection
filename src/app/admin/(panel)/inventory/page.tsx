import Link from "next/link";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { recomputeStock } from "@/lib/catalog";

export const dynamic = "force-dynamic";
async function setStock(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const id = Number(fd.get("id")); const stock = Math.max(0, Math.floor(Number(fd.get("stock"))));
  if (!id || !Number.isFinite(stock)) return;
  const [v] = await db.update(schema.productVariants).set({ stock }).where(eq(schema.productVariants.id, id)).returning();
  if (v) { await recomputeStock(db, v.productId); await db.insert(schema.auditLog).values({ actor: a.email, action: "stock.set", detail: `variant ${id} (product ${v.productId}) → ${stock}` }); }
  revalidatePath("/admin/inventory");
}
export default async function Inventory({ searchParams }: { searchParams: Promise<{ low?: string }> }) {
  const { low } = await searchParams;
  const all = await db.select({ v: schema.productVariants, name: schema.products.name, active: schema.products.active }).from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).orderBy(asc(schema.productVariants.stock), asc(schema.products.name));
  const rows = low ? all.filter((r) => r.v.stock <= 5) : all;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap"><h1 className="font-serif text-3xl font-bold">Inventory</h1>
        <div className="flex gap-2 text-xs"><Link href="/admin/inventory" className={`btn ${!low ? "btn-dark" : "btn-line"} !py-1.5`}>All</Link><Link href="/admin/inventory?low=1" className={`btn ${low ? "btn-dark" : "btn-line"} !py-1.5`}>Low stock (≤5)</Link></div></div>
      <p className="text-sm text-ink/60">Stock is tracked per size and colour. It is reserved when an order is placed and released if the order expires or is cancelled.</p>
      <div className="card overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr><th className="p-2">Product</th><th className="p-2">Size</th><th className="p-2">Colour</th><th className="p-2">Status</th><th className="p-2">Stock</th></tr></thead>
        <tbody>{rows.map(({ v, name, active }) => (
          <tr key={v.id} className="border-t border-champagne"><td className="p-2 font-semibold">{name}{!active && <span className="text-xs text-ink/50"> (hidden)</span>}</td><td className="p-2">{v.size || "—"}</td><td className="p-2">{v.color || "—"}</td>
            <td className="p-2">{v.stock === 0 ? <span className="bg-red-100 text-red-900 text-xs font-bold px-2 py-0.5">OUT</span> : v.stock <= 5 ? <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2 py-0.5">LOW</span> : <span className="bg-green-100 text-green-900 text-xs font-bold px-2 py-0.5">OK</span>}</td>
            <td className="p-2"><form action={setStock} className="flex gap-2"><input type="hidden" name="id" value={v.id} /><input name="stock" type="number" min={0} defaultValue={v.stock} className="input !w-24 !py-1" aria-label={`Stock for ${name} ${v.size} ${v.color}`} /><button className="btn btn-line !py-1 !px-3">Update</button></form></td></tr>))}</tbody></table>
        {rows.length === 0 && <p className="p-4 text-sm text-ink/60">Nothing here.</p>}</div>
    </div>
  );
}
