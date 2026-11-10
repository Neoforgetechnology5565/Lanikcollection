import Link from "next/link";
import { naira } from "@/lib/money";
import { ProductArt, artKind } from "./ProductArt";
import { WishlistButton } from "./WishlistButton";

export type CardProduct = { id: number; slug: string; name: string; priceKobo: number; saleKobo: number | null; images: string[]; stock: number; categoryName?: string | null; categorySlug?: string | null; wholesaleKobo?: number | null; wholesaleMin?: number | null };

export function Placeholder({ name, slug, big }: { name: string; slug?: string | null; big?: boolean }) {
  return <div className={`${big ? "aspect-[4/5]" : "aspect-[4/5]"} w-full overflow-hidden`}><ProductArt kind={artKind(slug)} seed={name.length} /></div>;
}

export function ProductCard({ p }: { p: CardProduct }) {
  const onSale = p.saleKobo != null && p.saleKobo > 0 && p.saleKobo < p.priceKobo;
  const pct = onSale ? Math.round((1 - p.saleKobo! / p.priceKobo) * 100) : 0;
  return (
    <div className="group relative">
      <Link href={`/product/${p.slug}`} className="block">
        <div className="relative overflow-hidden bg-ink aspect-[4/5]">
          {p.images[0]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.images[0]} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            : <div className="h-full w-full transition duration-700 group-hover:scale-105"><ProductArt kind={artKind(p.categorySlug)} seed={p.name.length} /></div>}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {onSale && <span className="bg-gold text-ink text-[10px] font-bold tracking-widest px-2 py-1">-{pct}%</span>}
            {p.wholesaleKobo && p.wholesaleMin ? <span className="bg-ink/85 text-gold-light text-[10px] font-semibold tracking-widest px-2 py-1 border border-gold/40">WHOLESALE</span> : null}
          </div>
          {p.stock <= 0 && <div className="absolute inset-0 bg-ink/60 flex items-center justify-center"><span className="text-champagne text-xs tracking-[.3em] border border-champagne/60 px-3 py-1.5">SOLD OUT</span></div>}
          <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition duration-300 bg-gradient-to-r from-gold-light to-gold text-ink text-center text-xs font-bold tracking-[.2em] py-3 hidden md:block">VIEW PRODUCT</div>
        </div>
        <div className="pt-3">
          {p.categoryName && <p className="text-[11px] uppercase tracking-[.2em] text-bronze">{p.categoryName}</p>}
          <h3 className="font-serif text-lg leading-snug mt-0.5 group-hover:text-bronze transition">{p.name}</h3>
          <p className="mt-1 text-sm">
            {onSale ? <><span className="font-bold">{naira(p.saleKobo!)}</span> <s className="text-ink/45 ml-1">{naira(p.priceKobo)}</s></> : <span className="font-bold">{naira(p.priceKobo)}</span>}
          </p>
        </div>
      </Link>
      <div className="absolute top-2 right-2"><WishlistButton id={p.id} /></div>
    </div>
  );
}
