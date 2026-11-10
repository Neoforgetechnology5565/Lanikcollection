import Link from "next/link";
import { and, asc, desc, eq, gt, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductCard } from "@/components/ProductCard";

export const metadata = { title: "Shop" };
const PAGE = 12;

export default async function Shop({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; sort?: string; page?: string; stock?: string }> }) {
  const sp = await searchParams;
  const cats = await db.select().from(schema.categories).orderBy(schema.categories.sort);
  const cat = cats.find((c) => c.slug === sp.cat);
  const q = sp.q?.trim().slice(0, 80);
  const like = q ? `%${q.replace(/[%_\\]/g, "")}%` : null;
  const where = and(eq(schema.products.active, true), cat ? eq(schema.products.categoryId, cat.id) : undefined,
    like ? or(ilike(schema.products.name, like), ilike(schema.products.description, like)) : undefined, sp.stock === "1" ? gt(schema.products.stock, 0) : undefined);
  const order = sp.sort === "price_asc" ? asc(schema.products.priceKobo) : sp.sort === "price_desc" ? desc(schema.products.priceKobo) : desc(schema.products.createdAt);
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await db.select().from(schema.products).where(where).orderBy(order).limit(PAGE + 1).offset((page - 1) * PAGE);
  const more = rows.length > PAGE;
  const byId = new Map(cats.map((c) => [c.id, c]));
  const href = (o: Record<string, string | undefined>) => { const u = new URLSearchParams(); const m = { q, cat: sp.cat, sort: sp.sort, stock: sp.stock, ...o }; Object.entries(m).forEach(([k, v]) => v && u.set(k, v)); return `/shop?${u}`; };
  const pill = (on: boolean) => `px-4 py-2 text-[12px] font-semibold tracking-[.15em] uppercase border transition ${on ? "bg-ink text-gold-light border-ink" : "border-champagne hover:border-gold bg-white"}`;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-10">
      <div className="text-center"><p className="eyebrow">{q ? "Search" : "The collection"}</p><h1 className="section-title mt-2">{cat?.name ?? (q ? `“${q}”` : "Shop all")}</h1><div className="rule mt-5 mx-auto max-w-xs" /></div>
      <div className="mt-8 flex flex-wrap gap-2 justify-center">
        <Link href={href({ cat: undefined, page: undefined })} className={pill(!cat)}>All</Link>
        {cats.map((c) => <Link key={c.id} href={href({ cat: c.slug, page: undefined })} className={pill(cat?.id === c.id)}>{c.name}</Link>)}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4 text-sm border-y border-champagne py-3">
        <span className="text-ink/60">{rows.slice(0, PAGE).length} product{rows.length === 1 ? "" : "s"}{more ? "+" : ""}</span>
        <div className="flex gap-4 flex-wrap justify-end">
          <Link href={href({ stock: sp.stock === "1" ? undefined : "1", page: undefined })} className={sp.stock === "1" ? "font-bold text-bronze" : "hover:text-bronze"}>In stock only</Link>
          <span className="text-champagne">|</span>
          {[[undefined, "Newest"], ["price_asc", "Price ↑"], ["price_desc", "Price ↓"]].map(([s, l]) => <Link key={l} href={href({ sort: s, page: undefined })} className={(sp.sort ?? undefined) === s ? "font-bold text-bronze" : "hover:text-bronze"}>{l}</Link>)}
        </div>
      </div>
      {rows.length === 0 ? <div className="py-20 text-center"><p className="font-serif text-2xl">Nothing found</p><p className="text-ink/60 mt-2">Try a different search or category.</p><Link href="/shop" className="btn btn-gold mt-5">Clear filters</Link></div> :
        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10">{rows.slice(0, PAGE).map((p) => { const c = p.categoryId ? byId.get(p.categoryId) : undefined; return <ProductCard key={p.id} p={{ ...p, categoryName: c?.name, categorySlug: c?.slug }} />; })}</div>}
      <div className="mt-12 flex gap-3 justify-center">
        {page > 1 && <Link className="btn btn-line" href={href({ page: String(page - 1) })}>← Previous</Link>}
        {more && <Link className="btn btn-line" href={href({ page: String(page + 1) })}>Next →</Link>}
      </div>
    </div>
  );
}
