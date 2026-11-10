"use client";
import Link from "next/link";
import { useCart, cart } from "@/lib/cart";
import { naira } from "@/lib/money";

export default function CartPage() {
  const items = useCart();
  const subtotal = items.reduce((a, i) => a + i.priceKobo * i.qty, 0);
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12">
      <p className="eyebrow">Your selection</p><h1 className="section-title mt-2">Shopping bag</h1>
      {items.length === 0 ? <div className="mt-8 card p-10 text-center"><p className="font-serif text-2xl">Your bag is empty</p><Link href="/shop" className="btn btn-gold mt-5">Continue shopping</Link></div> : (
        <div className="mt-8 grid lg:grid-cols-[1fr_320px] gap-8">
          <ul className="card divide-y divide-champagne">
            {items.map((i) => (
              <li key={`${i.productId}${i.size}${i.color}`} className="p-4 sm:p-5 flex gap-4 items-center flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-[10rem]"><Link href={`/product/${i.slug}`} className="font-serif text-xl hover:text-bronze">{i.name}</Link>
                  <p className="text-sm text-ink/60 mt-0.5">{[i.size && `Size ${i.size}`, i.color].filter(Boolean).join(" · ")}</p>
                  <button className="text-xs text-red-700 underline mt-2" onClick={() => cart.remove(i)}>Remove</button></div>
                <div className="inline-flex border border-ink items-center"><button className="px-3 py-2" aria-label="Decrease quantity" onClick={() => cart.setQty(i, i.qty - 1)}>−</button><span className="px-3 min-w-8 text-center" aria-live="polite">{i.qty}</span><button className="px-3 py-2" aria-label="Increase quantity" onClick={() => cart.setQty(i, i.qty + 1)}>+</button></div>
                <p className="w-28 text-right font-semibold">{naira(i.priceKobo * i.qty)}</p>
              </li>))}
          </ul>
          <aside className="card p-6 h-fit space-y-3 lg:sticky lg:top-28">
            <h2 className="font-serif text-xl font-bold">Summary</h2>
            <p className="flex justify-between"><span>Subtotal</span><b>{naira(subtotal)}</b></p>
            <p className="text-xs text-ink/60">Wholesale pricing, discount codes and shipping (by state) are calculated at checkout.</p>
            <Link href="/checkout" className="btn btn-gold w-full">Checkout</Link>
            <Link href="/shop" className="block text-center text-xs uppercase tracking-widest underline">Continue shopping</Link>
          </aside>
        </div>)}
    </div>
  );
}
