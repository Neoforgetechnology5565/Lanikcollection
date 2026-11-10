import Link from "next/link";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductCard } from "@/components/ProductCard";

export const metadata = { title: "Shop" };
const PAGE = 12;

export default async function Shop({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; sort?: string; page?: string }> }) {
  const sp = await searchParams;
  const cats = await db.select().from(schema.categories).orderBy(schema.categories.sort);
  const cat = cats.find((c) => c.slug === sp.cat);
  const q = sp.q?.trim();
  const where = and(
    eq(schema.products.active, true),
    cat ? eq(schema.products.categoryId, cat.id) : undefined,
    q ? or(ilike(schema.products.name, `%${q}%`), ilike(schema.products.description, `%${q}%`)) : undefined,
  );
  const order = sp.sort === "price_asc" ? asc(schema.products.priceKobo) : sp.sort === "price_desc" ? desc(schema.products.priceKobo) : desc(schema.products.createdAt);
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await db.select().from(schema.products).where(where).orderBy(order).limit(PAGE + 1).offset((page - 1) * PAGE);
  const more = rows.length > PAGE;
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const href = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams(); const m = { q, cat: sp.cat, sort: sp.sort, ...o };
    Object.entries(m).forEach(([k, v]) => v && u.set(k, v)); return `/shop?${u}`;
  };
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <h1 className="font-serif text-4xl font-bold">{cat?.name ?? (q ? `Results for “${q}”` : "Shop all")}</h1>
      <div className="mt-5 flex flex-wrap gap-2 items-center">
        <Link href={href({ cat: undefined, page: undefined })} className={`btn ${!cat ? "btn-dark" : "btn-line"} !py-1.5`}>All</Link>
        {cats.map((c) => <Link key={c.id} href={href({ cat: c.slug, page: undefined })} className={`btn ${cat?.id === c.id ? "btn-dark" : "btn-line"} !py-1.5`}>{c.name}</Link>)}
        <span className="ml-auto text-sm flex gap-3">
          <Link href={href({ sort: undefined })} className="hover:text-bronze">Newest</Link>
          <Link href={href({ sort: "price_asc" })} className="hover:text-bronze">Price ↑</Link>
          <Link href={href({ sort: "price_desc" })} className="hover:text-bronze">Price ↓</Link>
        </span>
      </div>
      {rows.length === 0 ? <p className="mt-10 text-ink/60">No products found.</p> :
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">{rows.slice(0, PAGE).map((p) => <ProductCard key={p.id} p={{ ...p, categoryName: p.categoryId ? catName.get(p.categoryId) : null }} />)}</div>}
      <div className="mt-8 flex gap-3 justify-center">
        {page > 1 && <Link className="btn btn-line" href={href({ page: String(page - 1) })}>← Previous</Link>}
        {more && <Link className="btn btn-line" href={href({ page: String(page + 1) })}>Next →</Link>}
      </div>
    </div>
  );
}
