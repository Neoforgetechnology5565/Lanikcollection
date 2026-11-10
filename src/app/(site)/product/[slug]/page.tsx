import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";
import { getCustomerId } from "@/lib/session";
import { AddToCart } from "./AddToCart";
import { ProductCard, type CardProduct } from "@/components/ProductCard";
import { ProductArt, artKind } from "@/components/ProductArt";
import { WishlistButton } from "@/components/WishlistButton";

async function load(slug: string) {
  const [p] = await db.select().from(schema.products).where(and(eq(schema.products.slug, slug), eq(schema.products.active, true)));
  return p;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.name, description: p.description.slice(0, 155), openGraph: { images: p.images.slice(0, 1) } } : {};
}

async function submitReview(fd: FormData) {
  "use server";
  const cid = await getCustomerId(); if (!cid) return;
  const productId = Number(fd.get("productId")); const rating = Math.min(5, Math.max(1, Number(fd.get("rating")) || 0));
  const body = String(fd.get("body") ?? "").trim().slice(0, 600);
  if (!productId || body.length < 5) return;
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, cid));
  // Only verified buyers (a paid order containing this product) may review.
  const bought = await db.select({ id: schema.orders.id }).from(schema.orders).innerJoin(schema.orderItems, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(eq(schema.orderItems.productId, productId), sql`${schema.orders.status} in ('PAID','PROCESSING','SHIPPED','DELIVERED')`, c.emailVerifiedAt ? sql`(${schema.orders.customerId} = ${cid} or lower(${schema.orders.email}) = ${c.email})` : sql`${schema.orders.customerId} = ${cid}`)).limit(1);
  if (!bought.length) return;
  await db.insert(schema.reviews).values({ productId, customerId: cid, name: c.name.split(" ")[0], rating, body }).onConflictDoNothing();
  revalidatePath("/product/[slug]", "page");
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const [cat] = p.categoryId ? await db.select().from(schema.categories).where(eq(schema.categories.id, p.categoryId)) : [];
  const relatedRows = p.categoryId ? await db.select().from(schema.products).where(and(eq(schema.products.categoryId, p.categoryId), ne(schema.products.id, p.id), eq(schema.products.active, true))).limit(4) : [];
  const related: CardProduct[] = relatedRows.map((r) => ({ ...r, categoryName: cat?.name, categorySlug: cat?.slug }));
  const variants = await db.select({ size: schema.productVariants.size, color: schema.productVariants.color, stock: schema.productVariants.stock }).from(schema.productVariants).where(eq(schema.productVariants.productId, p.id));
  const reviews = await db.select().from(schema.reviews).where(and(eq(schema.reviews.productId, p.id), eq(schema.reviews.status, "APPROVED"))).orderBy(desc(schema.reviews.id));
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const cid = await getCustomerId();
  const onSale = p.saleKobo != null && p.saleKobo > 0 && p.saleKobo < p.priceKobo;
  const price = onSale ? p.saleKobo! : p.priceKobo;
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description, image: p.images,
    offers: { "@type": "Offer", priceCurrency: "NGN", price: price / 100, availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
    ...(reviews.length ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: reviews.length } } : {}) };
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <nav className="text-xs uppercase tracking-widest text-ink/50" aria-label="Breadcrumb"><Link href="/" className="hover:text-bronze">Home</Link> / <Link href="/shop" className="hover:text-bronze">Shop</Link>{cat && <> / <Link href={`/shop?cat=${cat.slug}`} className="hover:text-bronze">{cat.name}</Link></>}</nav>
      <div className="mt-6 grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-16">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 content-start">
          {p.images.length ? p.images.map((src, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={src} alt={`${p.name} ${i + 1}`} className={`w-full aspect-[4/5] object-cover bg-ink ${i === 0 ? "sm:col-span-2 lg:col-span-1 xl:col-span-2" : ""}`} />)
            : <div className="aspect-[4/5] sm:col-span-2 lg:col-span-1 xl:col-span-2 overflow-hidden"><ProductArt kind={artKind(cat?.slug)} seed={p.name.length} /></div>}
        </div>
        <div className="lg:sticky lg:top-28 self-start">
          {cat && <p className="eyebrow">{cat.name}</p>}
          <h1 className="font-serif text-4xl lg:text-5xl font-bold leading-tight mt-2">{p.name}</h1>
          {reviews.length > 0 && <p className="mt-2 text-sm"><span className="text-gold tracking-widest">{"★".repeat(Math.round(avg))}</span> <span className="text-ink/60">{avg.toFixed(1)} · {reviews.length} review{reviews.length > 1 ? "s" : ""}</span></p>}
          <p className="mt-4 text-3xl">{onSale ? <><b>{naira(price)}</b> <s className="text-ink/40 text-xl ml-2">{naira(p.priceKobo)}</s> <span className="ml-2 align-middle bg-gold text-ink text-xs font-bold px-2 py-1">-{Math.round((1 - price / p.priceKobo) * 100)}%</span></> : <b>{naira(price)}</b>}</p>
          {p.wholesaleKobo && p.wholesaleMin && <p className="mt-3 inline-block bg-ink text-gold-light text-xs tracking-widest uppercase px-3 py-2">Wholesale · {naira(p.wholesaleKobo)} each from {p.wholesaleMin} pcs</p>}
          <p className={`mt-4 text-sm font-semibold ${p.stock > 0 ? "text-green-800" : "text-red-700"}`}>● {p.stock > 5 ? "In stock" : p.stock > 0 ? `Only ${p.stock} left` : "Out of stock"}</p>
          <AddToCart p={{ id: p.id, slug: p.slug, name: p.name, priceKobo: price, sizes: p.sizes, colors: p.colors, variants, image: p.images[0] }} />
          <div className="mt-4"><WishlistButton id={p.id} label /></div>
          <div className="mt-8 border-t border-champagne divide-y divide-champagne text-sm">
            <details className="py-4" open><summary className="cursor-pointer font-semibold uppercase tracking-widest text-xs">Description</summary><p className="mt-3 text-ink/80 whitespace-pre-line leading-relaxed">{p.description}</p></details>
            <details className="py-4"><summary className="cursor-pointer font-semibold uppercase tracking-widest text-xs">Payment &amp; delivery</summary><p className="mt-3 text-ink/80 leading-relaxed">Pay by card, bank transfer (a unique account is created for your order), USSD, OPay or QR. Delivery fees depend on your state and are shown before you pay. <Link className="underline" href="/pages/shipping-returns">Shipping &amp; returns</Link>.</p></details>
          </div>
        </div>
      </div>

      <section className="mt-20 max-w-3xl" id="reviews">
        <h2 className="section-title">Reviews</h2>
        {reviews.length === 0 ? <p className="mt-3 text-ink/60">No reviews yet.</p> :
          <ul className="mt-5 divide-y divide-champagne">{reviews.map((r) => <li key={r.id} className="py-4"><span className="text-gold tracking-widest">{"★".repeat(r.rating)}</span><p className="mt-1">{r.body}</p><p className="text-xs uppercase tracking-widest text-ink/50 mt-1">{r.name} · verified buyer</p></li>)}</ul>}
        {cid ? (
          <form action={submitReview} className="card p-5 mt-6 space-y-3">
            <h3 className="font-serif text-xl font-bold">Write a review</h3>
            <p className="text-xs text-ink/60">Reviews are from verified purchases and appear after approval.</p>
            <input type="hidden" name="productId" value={p.id} />
            <div><label className="label" htmlFor="rating">Rating</label><select id="rating" name="rating" className="input !w-auto" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select></div>
            <div><label className="label" htmlFor="body">Your review</label><textarea id="body" name="body" rows={3} required minLength={5} maxLength={600} className="input" /></div>
            <button className="btn btn-dark">Submit review</button>
          </form>
        ) : <p className="mt-5 text-sm"><Link className="underline" href="/account/login">Sign in</Link> to review products you&apos;ve bought.</p>}
      </section>

      {related.length > 0 && <section className="mt-20"><h2 className="section-title">You may also like</h2>
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div></section>}
    </div>
  );
}
