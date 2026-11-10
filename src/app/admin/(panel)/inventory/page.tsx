import Link from "next/link";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
async function setStock(fd: FormData) {
  "use server"; const a = await requireAdmin();
  const id = Number(fd.get("id")); const stock = Math.max(0, Math.floor(Number(fd.get("stock"))));
  if (!id || !Number.isFinite(stock)) return;
  await db.update(schema.products).set({ stock }).where(eq(schema.products.id, id));
  await db.insert(schema.auditLog).values({ actor: a.email, action: "stock.set", detail: `product ${id} → ${stock}` });
  revalidatePath("/admin/inventory");
}
export default async function Inventory({ searchParams }: { searchParams: Promise<{ low?: string }> }) {
  const { low } = await searchParams;
  const all = await db.select().from(schema.products).orderBy(asc(schema.products.stock));
  const rows = low ? all.filter((p) => p.stock <= 5) : all;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap"><h1 className="font-serif text-3xl font-bold">Inventory</h1>
        <div className="flex gap-2 text-xs"><Link href="/admin/inventory" className={`btn ${!low ? "btn-dark" : "btn-line"} !py-1.5`}>All</Link><Link href="/admin/inventory?low=1" className={`btn ${low ? "btn-dark" : "btn-line"} !py-1.5`}>Low stock (≤5)</Link></div></div>
      <p className="text-sm text-ink/60">Stock is reserved when an order is placed and released if it expires or is cancelled.</p>
      <div className="card overflow-x-auto"><table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider bg-champagne/50"><tr><th className="p-2">Product</th><th className="p-2">Sizes / colours</th><th className="p-2">Status</th><th className="p-2">Stock</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} className="border-t border-champagne"><td className="p-2 font-semibold">{p.name}{!p.active && <span className="text-xs text-ink/50"> (hidden)</span>}</td>
            <td className="p-2 text-xs text-ink/60">{p.sizes.join(" ")} {p.colors.length ? "· " + p.colors.join(", ") : ""}</td>
            <td className="p-2">{p.stock === 0 ? <span className="bg-red-100 text-red-900 text-xs font-bold px-2 py-0.5">OUT</span> : p.stock <= 5 ? <span className="bg-amber-100 text-amber-900 text-xs font-bold px-2 py-0.5">LOW</span> : <span className="bg-green-100 text-green-900 text-xs font-bold px-2 py-0.5">OK</span>}</td>
            <td className="p-2"><form action={setStock} className="flex gap-2"><input type="hidden" name="id" value={p.id} /><input name="stock" type="number" min={0} defaultValue={p.stock} className="input !w-24 !py-1" aria-label={`Stock for ${p.name}`} /><button className="btn btn-line !py-1 !px-3">Update</button></form></td></tr>))}</tbody></table></div>
    </div>
  );
}
