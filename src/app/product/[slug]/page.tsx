import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { naira } from "@/lib/money";
import { AddToCart } from "./AddToCart";
import { Placeholder, ProductCard } from "@/components/ProductCard";

async function load(slug: string) {
  const [p] = await db.select().from(schema.products).where(and(eq(schema.products.slug, slug), eq(schema.products.active, true)));
  return p;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await load((await params).slug);
  return p ? { title: p.name, description: p.description.slice(0, 155) } : {};
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  const related = p.categoryId ? await db.select().from(schema.products)
    .where(and(eq(schema.products.categoryId, p.categoryId), ne(schema.products.id, p.id), eq(schema.products.active, true))).limit(4) : [];
  const onSale = p.saleKobo != null && p.saleKobo > 0 && p.saleKobo < p.priceKobo;
  const price = onSale ? p.saleKobo! : p.priceKobo;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description, image: p.images,
        offers: { "@type": "Offer", priceCurrency: "NGN", price: price / 100, availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } }).replace(/</g, "\\u003c") }} />
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-3">
          {p.images.length ? p.images.map((src, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={src} alt={`${p.name} ${i + 1}`} className="w-full card" />) : <Placeholder name={p.name} />}
        </div>
        <div>
          <h1 className="font-serif text-4xl font-bold">{p.name}</h1>
          <p className="mt-3 text-2xl">{onSale ? <><b>{naira(price)}</b> <s className="text-ink/50 text-lg ml-2">{naira(p.priceKobo)}</s></> : <b>{naira(price)}</b>}</p>
          {p.wholesaleKobo && p.wholesaleMin && <p className="mt-2 text-sm text-bronze font-semibold">Wholesale: {naira(p.wholesaleKobo)} each from {p.wholesaleMin} pieces</p>}
          <p className="mt-4 text-ink/80 whitespace-pre-line">{p.description}</p>
          <p className={`mt-4 text-sm font-semibold ${p.stock > 0 ? "text-green-700" : "text-red-700"}`}>{p.stock > 5 ? "In stock" : p.stock > 0 ? `Only ${p.stock} left` : "Out of stock"}</p>
          <AddToCart p={{ id: p.id, slug: p.slug, name: p.name, priceKobo: price, sizes: p.sizes, colors: p.colors, stock: p.stock, image: p.images[0] }} />
        </div>
      </div>
      {related.length > 0 && <><h2 className="font-serif text-2xl font-bold mt-14">You may also like</h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div></>}
    </div>
  );
}
