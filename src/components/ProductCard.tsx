import Link from "next/link";
import { naira } from "@/lib/money";

export type CardProduct = { slug: string; name: string; priceKobo: number; saleKobo: number | null; images: string[]; stock: number; categoryName?: string | null };

export function Placeholder({ name }: { name: string }) {
  return (
    <div className="aspect-[4/5] w-full bg-gradient-to-br from-ink via-[#1d1710] to-bronze flex items-center justify-center">
      <span className="font-serif text-5xl text-gold-light/80">{name.trim()[0]}</span>
    </div>
  );
}

export function ProductCard({ p }: { p: CardProduct }) {
  const onSale = p.saleKobo != null && p.saleKobo > 0 && p.saleKobo < p.priceKobo;
  return (
    <Link href={`/product/${p.slug}`} className="group block card overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition">
      <div className="relative overflow-hidden">
        {p.images[0]
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.images[0]} alt={p.name} className="aspect-[4/5] w-full object-cover group-hover:scale-105 transition duration-500" />
          : <Placeholder name={p.name} />}
        {onSale && <span className="absolute top-3 left-3 bg-gold text-ink text-[10px] font-bold tracking-widest px-2 py-1">SALE</span>}
        {p.stock <= 0 && <span className="absolute top-3 right-3 bg-ink text-champagne text-[10px] font-bold tracking-widest px-2 py-1">SOLD OUT</span>}
      </div>
      <div className="p-4">
        {p.categoryName && <p className="text-[11px] uppercase tracking-widest text-bronze">{p.categoryName}</p>}
        <h3 className="font-serif text-lg leading-snug mt-0.5">{p.name}</h3>
        <p className="mt-1 text-sm">
          {onSale ? <><span className="font-bold">{naira(p.saleKobo!)}</span> <s className="text-ink/50 ml-1">{naira(p.priceKobo)}</s></> : <span className="font-bold">{naira(p.priceKobo)}</span>}
        </p>
      </div>
    </Link>
  );
}
