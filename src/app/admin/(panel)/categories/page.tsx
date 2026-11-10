import { revalidatePath } from "next/cache";
import { asc, eq, count } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const done = () => { revalidatePath("/admin/categories"); revalidatePath("/", "layout"); };

async function add(fd: FormData) {
  "use server"; await requireAdmin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 60); if (!name) return;
  const [m] = await db.select({ n: count() }).from(schema.categories);
  await db.insert(schema.categories).values({ name, slug: slugify(name) || `cat-${Date.now()}`, sort: m.n, menuGroup: String(fd.get("group") ?? "").trim().slice(0, 40) || null }).onConflictDoNothing(); done();
}
async function rename(fd: FormData) {
  "use server"; await requireAdmin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 60); if (!name) return;
  await db.update(schema.categories).set({ name, sort: Number(fd.get("sort")) || 0, menuGroup: String(fd.get("group") ?? "").trim().slice(0, 40) || null }).where(eq(schema.categories.id, Number(fd.get("id")))); done();
}
async function remove(fd: FormData) {
  "use server"; await requireAdmin();
  const id = Number(fd.get("id")); const [u] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.categoryId, id));
  if (u.n > 0) return; // refuse: products still use it
  await db.delete(schema.categories).where(eq(schema.categories.id, id)); done();
}
export default async function Categories() {
  const rows = await db.select().from(schema.categories).orderBy(asc(schema.categories.sort));
  const used = new Map((await db.select({ id: schema.products.categoryId, n: count() }).from(schema.products).groupBy(schema.products.categoryId)).map((r) => [r.id, r.n]));
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-serif text-3xl font-bold">Categories</h1>
      <p className="text-sm text-ink/70">The <b>menu group</b> is the heading the category appears under in the Shop dropdown (e.g. Underwear). Categories with the same group sit together; leave it empty to put a category under &ldquo;More&rdquo;. <b>Order</b> sets the position (lower first).</p>
      <form action={add} className="card p-4 flex gap-2 flex-wrap"><input name="name" required placeholder="New category name" className="input flex-1 min-w-40" /><input name="group" list="groups" placeholder="Menu group" className="input !w-44" /><button className="btn btn-dark">Add</button></form>
      <datalist id="groups">{[...new Set(rows.map((r) => r.menuGroup).filter(Boolean))].map((g) => <option key={g!} value={g!} />)}</datalist>
      <ul className="card divide-y divide-champagne">{rows.map((c) => (
        <li key={c.id} className="p-3 flex gap-2 items-center flex-wrap">
          <form action={rename} className="flex gap-2 flex-1 min-w-60"><input type="hidden" name="id" value={c.id} /><input name="name" defaultValue={c.name} className="input" /><input name="group" list="groups" defaultValue={c.menuGroup ?? ""} placeholder="Menu group" className="input !w-40" aria-label="Menu group" /><input name="sort" type="number" defaultValue={c.sort} className="input !w-20" aria-label="Order" /><button className="btn btn-line !py-1.5">Save</button></form>
          <span className="text-xs text-ink/50">{used.get(c.id) ?? 0} products</span>
          {(used.get(c.id) ?? 0) === 0 && <form action={remove}><input type="hidden" name="id" value={c.id} /><button className="text-xs text-red-700 underline">Delete</button></form>}
        </li>))}</ul>
    </div>
  );
}
