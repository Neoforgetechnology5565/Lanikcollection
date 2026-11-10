import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProductCard, type CardProduct } from "@/components/ProductCard";
import { HeroCarousel } from "@/components/HeroCarousel";
import { ProductArt, artKind } from "@/components/ProductArt";
import { Newsletter } from "@/components/Newsletter";
import { getContent, safeHref } from "@/lib/content";

const TRUST = ["Card · Transfer · USSD · OPay", "Wholesale pricing available", "Secure payments by Flutterwave", "Order tracking", "Quality at affordable prices"];
const Stars = ({ n }: { n: number }) => <span aria-label={`${n} out of 5`} className="text-gold tracking-widest">{"★".repeat(n)}<span className="text-champagne">{"★".repeat(5 - n)}</span></span>;

export default async function Home() {
  const content = await getContent();
  const cats = await db.select().from(schema.categories).orderBy(schema.categories.sort);
  const bySlug = new Map(cats.map((c) => [c.id, c]));
  const decorate = (rows: (typeof schema.products.$inferSelect)[]): CardProduct[] => rows.map((p) => ({ ...p, categoryName: p.categoryId ? bySlug.get(p.categoryId)?.name : null, categorySlug: p.categoryId ? bySlug.get(p.categoryId)?.slug : null }));
  const active = eq(schema.products.active, true);
  const featured = decorate(await db.select().from(schema.products).where(and(active, eq(schema.products.featured, true))).limit(8));
  const latest = decorate(await db.select().from(schema.products).where(active).orderBy(desc(schema.products.createdAt)).limit(4));
  const reviews = await db.select({ r: schema.reviews, product: schema.products.name }).from(schema.reviews)
    .innerJoin(schema.products, eq(schema.products.id, schema.reviews.productId)).where(eq(schema.reviews.status, "APPROVED")).orderBy(desc(schema.reviews.id)).limit(3);
  const counts = await db.select({ id: schema.products.categoryId, n: sql<number>`count(*)::int` }).from(schema.products).where(active).groupBy(schema.products.categoryId);
  const countOf = new Map(counts.map((c) => [c.id, c.n]));
  const kinds = ["perfume", "boxers", "polo", "jeans", "gift"];
  const slides = content.banners.map((b, n) => ({ ...b, href: safeHref(b.href), kind: kinds[n % kinds.length] }));

  return (
    <>
      <HeroCarousel slides={slides} />

      <div className="bg-ink text-gold-light border-y border-gold/30 overflow-hidden" aria-hidden="true">
        <div className="marquee py-3 text-[11px] tracking-[.3em] uppercase">{[...TRUST, ...TRUST, ...TRUST, ...TRUST].map((t, i) => <span key={i} className="px-8 whitespace-nowrap">◆ &nbsp;{t}</span>)}</div>
      </div>

      <section id="categories" className="mx-auto max-w-7xl px-4 pt-20">
        <div className="text-center"><p className="eyebrow">Collections</p><h2 className="section-title mt-2">Shop by category</h2><div className="rule mt-5 mx-auto max-w-xs" /></div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
          {cats.map((c) => (
            <Link key={c.id} href={`/shop?cat=${c.slug}`} className="group relative aspect-[4/5] md:aspect-[5/4] overflow-hidden bg-ink">
              <div className="absolute inset-0 transition duration-700 group-hover:scale-105"><ProductArt kind={artKind(c.slug)} seed={c.id} /></div>
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-5 flex items-end justify-between text-champagne">
                <div><h3 className="font-serif text-xl md:text-2xl">{c.name}</h3><p className="text-[11px] tracking-[.2em] uppercase text-gold-light/80 mt-1">{countOf.get(c.id) ?? 0} items</p></div>
                <span className="text-gold text-2xl transition group-hover:translate-x-1.5">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {featured.length > 0 && <section className="mx-auto max-w-7xl px-4 pt-24">
        <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Customer favourites</p><h2 className="section-title mt-2">Best sellers</h2></div><Link href="/shop" className="text-sm font-semibold uppercase tracking-widest hover:text-bronze hidden sm:block">View all →</Link></div>
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">{featured.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>}

      {content.promo.active && <section className="mt-24 bg-ink text-champagne grain relative overflow-hidden">
        <div className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(60% 120% at 100% 50%, rgba(217,154,36,.4), transparent 70%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 py-16 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div><p className="eyebrow !text-gold-light">Offer</p><h2 className="font-serif text-3xl md:text-5xl font-bold mt-3 gold-text leading-tight">{content.promo.title}</h2><p className="mt-4 text-champagne/75 max-w-xl">{content.promo.body}</p></div>
          <Link href={safeHref(content.promo.href)} className="btn btn-gold">{content.promo.cta}</Link>
        </div>
      </section>}

      {latest.length > 0 && <section className="mx-auto max-w-7xl px-4 pt-24">
        <p className="eyebrow">Just landed</p><h2 className="section-title mt-2">New arrivals</h2>
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">{latest.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>}

      <section className="mx-auto max-w-7xl px-4 pt-24">
        <div className="grid md:grid-cols-2 gap-0 border border-gold/40">
          <div className="bg-ink text-champagne p-10 md:p-14 grain relative">
            <p className="eyebrow !text-gold-light">Wholesale &amp; Retail</p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold mt-3 gold-text">Buying in bulk? Pay less per piece.</h2>
            <p className="mt-4 text-champagne/75">Wholesale prices apply automatically once you reach a product&apos;s minimum quantity. Need a custom quote or mixed order? Talk to us directly.</p>
            <Link href="/wholesale" className="btn btn-gold mt-7">Wholesale enquiries</Link>
          </div>
          <div className="bg-champagne/60 p-10 md:p-14 grid grid-cols-3 gap-4 content-center text-center">
            {[["Order", "Pick your items"], ["Pay", "Card, transfer, USSD or OPay"], ["Track", "Follow your order"]].map(([a, b], n) => <div key={a}><p className="font-serif text-4xl gold-text">{n + 1}</p><p className="font-semibold uppercase tracking-widest text-xs mt-1">{a}</p><p className="text-xs text-ink/60 mt-1">{b}</p></div>)}
          </div>
        </div>
      </section>

      {reviews.length > 0 && <section className="mx-auto max-w-7xl px-4 pt-24">
        <div className="text-center"><p className="eyebrow">Reviews</p><h2 className="section-title mt-2">What customers say</h2></div>
        <div className="mt-10 grid md:grid-cols-3 gap-5">{reviews.map(({ r, product }) => (
          <figure key={r.id} className="card p-6"><Stars n={r.rating} /><blockquote className="mt-3 font-serif text-lg leading-snug">“{r.body}”</blockquote><figcaption className="mt-4 text-xs uppercase tracking-widest text-ink/60">{r.name} · {product}</figcaption></figure>))}</div>
      </section>}

      <section className="mx-auto max-w-3xl px-4 pt-24 text-center">
        <p className="eyebrow">Stay in the loop</p><h2 className="section-title mt-2">New drops &amp; private offers</h2>
        <p className="mt-3 text-ink/70">Join the list. We only send the good stuff.</p>
        <div className="mt-6 flex justify-center"><Newsletter /></div>
      </section>
    </>
  );
}
