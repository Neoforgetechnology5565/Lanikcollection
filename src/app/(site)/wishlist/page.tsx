"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWishlist } from "@/lib/wishlist";
import { ProductCard, type CardProduct } from "@/components/ProductCard";

export default function Wishlist() {
  const ids = useWishlist(); const [items, setItems] = useState<CardProduct[] | null>(null);
  useEffect(() => {
    if (!ids.length) { setItems([]); return; }
    fetch(`/api/search?ids=${ids.join(",")}`).then((r) => r.json()).then((rows) => setItems(rows.filter((r: CardProduct) => ids.includes(r.id)))).catch(() => setItems([]));
  }, [ids]);
  return (
    <div className="mx-auto max-w-7xl px-4 pt-12">
      <p className="eyebrow">Saved for later</p><h1 className="section-title mt-2">Wishlist</h1>
      {items === null ? <p className="mt-6 text-ink/60">Loading…</p> : items.length === 0 ? <div className="mt-6"><p className="text-ink/60">Nothing saved yet. Tap the heart on any product.</p><Link href="/shop" className="btn btn-gold mt-4">Browse products</Link></div> :
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      <p className="mt-10 text-xs text-ink/50">Your wishlist is saved on this device.</p>
    </div>
  );
}
