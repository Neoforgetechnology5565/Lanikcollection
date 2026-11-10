import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";
import { naira, toKobo } from "@/lib/money";

export const dynamic = "force-dynamic";
const list = (s: FormDataEntryValue | null) => String(s ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const kobo = (v: FormDataEntryValue | null) => (v && Number(v) > 0 ? toKobo(Number(v)) : null);
const httpUrls = (a: string[]) => a.filter((u) => /^https?:\/\//i.test(u) || u.startsWith("/")); // no javascript:/data: URLs

async function upsert(fd: FormData) {
  "use server";
  await requireAdmin();
  const name = String(fd.get("name") ?? "").trim(); const price = kobo(fd.get("price"));
  if (!name || !price) return;
  const id = Number(fd.get("id")) || null;
  const v = {
    name, description: String(fd.get("description") ?? ""), categoryId: Number(fd.get("categoryId")) || null,
    priceKobo: price, saleKobo: kobo(fd.get("sale")), wholesaleKobo: kobo(fd.get("wholesale")), wholesaleMin: Number(fd.get("wholesaleMin")) || null,
    images: httpUrls(list(fd.get("images"))), sizes: list(fd.get("sizes")), colors: list(fd.get("colors")),
    stock: Math.max(0, Number(fd.get("stock")) || 0), featured: fd.get("featured") === "on", active: fd.get("active") === "on",
  };
  if (id) await db.update(schema.products).set(v).where(eq(schema.products.id, id));
  else await db.insert(schema.products).values({ ...v, slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}` });
  revalidatePath("/admin/products"); revalidatePath("/shop");
}
async function remove(fd: FormData) {
  "use server"; await requireAdmin();
  // Products referenced by orders are deactivated, not deleted, so order history stays intact.
  await db.update(schema.products).set({ active: false }).where(eq(schema.products.id, Number(fd.get("id"))));
  revalidatePath("/admin/products");
}

type P = typeof schema.products.$inferSelect;
function Form({ p, cats }: { p?: P; cats: { id: number; name: string }[] }) {
  return (
    <form action={upsert} className="grid sm:grid-cols-3 gap-3 p-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="sm:col-span-2"><label className="label">Name</label><input name="name" required defaultValue={p?.name} className="input" /></div>
      <div><label className="label">Category</label><select name="categoryId" defaultValue={p?.categoryId ?? ""} className="input"><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="label">Price ₦</label><input name="price" type="number" step="0.01" min="1" required defaultValue={p ? p.priceKobo / 100 : ""} className="input" /></div>
      <div><label className="label">Sale price ₦</label><input name="sale" type="number" step="0.01" defaultValue={p?.saleKobo ? p.saleKobo / 100 : ""} className="input" /></div>
      <div><label className="label">Stock</label><input name="stock" type="number" min="0" defaultValue={p?.stock ?? 0} className="input" /></div>
      <div><label className="label">Wholesale price ₦</label><input name="wholesale" type="number" step="0.01" defaultValue={p?.wholesaleKobo ? p.wholesaleKobo / 100 : ""} className="input" /></div>
      <div><label className="label">Wholesale min qty</label><input name="wholesaleMin" type="number" min="2" defaultValue={p?.wholesaleMin ?? ""} className="input" /></div>
      <div><label className="label">Sizes (comma-separated)</label><input name="sizes" defaultValue={p?.sizes.join(", ")} className="input" /></div>
      <div><label className="label">Colours</label><input name="colors" defaultValue={p?.colors.join(", ")} className="input" /></div>
      <div className="sm:col-span-2"><label className="label">Image URLs (one per line)</label><textarea name="images" rows={2} defaultValue={p?.images.join("\n")} className="input" /></div>
      <div className="sm:col-span-3"><label className="label">Description</label><textarea name="description" rows={2} defaultValue={p?.description} className="input" /></div>
      <label className="text-sm flex gap-2 items-center"><input type="checkbox" name="featured" defaultChecked={p?.featured} className="accent-[#D99A24]" />Featured</label>
      <label className="text-sm flex gap-2 items-center"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="accent-[#D99A24]" />Listed</label>
      <div className="flex gap-2 justify-end"><button className="btn btn-dark">{p ? "Save" : "Add product"}</button></div>
    </form>
  );
}

export default async function Products() {
  const cats = await db.select().from(schema.categories).orderBy(schema.categories.sort);
  const rows = await db.select().from(schema.products).orderBy(desc(schema.products.id));
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl font-bold">Products</h1>
      <details className="card" open={rows.length === 0}><summary className="p-3 cursor-pointer font-semibold">+ Add a product</summary><Form cats={cats} /></details>
      {rows.map((p) => (
        <details key={p.id} className="card">
          <summary className="p-3 cursor-pointer flex gap-3 items-center"><b>{p.name}</b><span className="text-sm">{naira(p.priceKobo)}</span><span className="text-xs text-ink/60">stock {p.stock}{p.stock <= 5 && " ⚠"}{!p.active && " · hidden"}</span></summary>
          <Form p={p} cats={cats} />
          <form action={remove} className="px-4 pb-4"><input type="hidden" name="id" value={p.id} /><button className="text-sm text-red-700 underline">Hide from shop</button></form>
        </details>))}
    </div>
  );
}
