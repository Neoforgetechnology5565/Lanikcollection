import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductCard } from "@/components/ProductCard";
import { Logo } from "@/components/Logo";

export default async function Home() {
  const cats = await db.select().from(schema.categories).orderBy(schema.categories.sort);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const featured = await db.select().from(schema.products).where(and(eq(schema.products.active, true), eq(schema.products.featured, true))).limit(8);
  const latest = await db.select().from(schema.products).where(eq(schema.products.active, true)).orderBy(desc(schema.products.createdAt)).limit(4);
  const card = (p: typeof featured[number]) => <ProductCard key={p.id} p={{ ...p, categoryName: p.categoryId ? catName.get(p.categoryId) : null }} />;
  return (
    <>
      <section className="bg-ink text-champagne relative overflow-hidden">
        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse at 50% 120%, #D99A24 0%, transparent 60%)" }} />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28 text-center">
          <Logo dark size="lg" />
          <p className="mt-8 text-lg tracking-[0.25em] uppercase text-gold-light">Quality Fashion · Fragrance · Lifestyle</p>
          <p className="mt-4 max-w-xl mx-auto text-champagne/80">Perfumes, boxers, singlets, polos &amp; jeans. Wholesale and retail, at prices that make sense.</p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/shop" className="btn btn-gold">Shop Now</Link>
            <Link href="/#categories" className="btn btn-dark">Explore Collections</Link>
          </div>
        </div>
      </section>
      <section id="categories" className="mx-auto max-w-6xl px-4 pt-14">
        <h2 className="font-serif text-3xl font-bold">Shop by category</h2>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          {cats.map((c) => (
            <Link key={c.id} href={`/shop?cat=${c.slug}`} className="group relative overflow-hidden bg-gradient-to-br from-ink to-[#2a1f10] text-champagne p-6 h-32 flex items-end hover:shadow-xl transition">
              <span className="font-serif text-xl group-hover:text-gold-light transition">{c.name}</span>
              <span className="absolute top-3 right-4 text-gold text-2xl opacity-60 group-hover:translate-x-1 transition">→</span>
            </Link>
          ))}
        </div>
      </section>
      {featured.length > 0 && <section className="mx-auto max-w-6xl px-4 pt-14"><h2 className="font-serif text-3xl font-bold">Best sellers</h2>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">{featured.map(card)}</div></section>}
      {latest.length > 0 && <section className="mx-auto max-w-6xl px-4 pt-14"><h2 className="font-serif text-3xl font-bold">New arrivals</h2>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">{latest.map(card)}</div></section>}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="bg-ink text-champagne p-8 md:p-12 grid md:grid-cols-2 gap-6 items-center border border-gold/40">
          <div><h2 className="font-serif text-3xl gold-text font-bold">Buying in bulk?</h2>
            <p className="mt-3 text-champagne/80">Wholesale pricing applies automatically when you reach a product&apos;s minimum order quantity. Need a custom quote? Talk to us.</p></div>
          <div className="md:text-right"><Link href="/wholesale" className="btn btn-gold">Wholesale enquiries</Link></div>
        </div>
      </section>
    </>
  );
}
