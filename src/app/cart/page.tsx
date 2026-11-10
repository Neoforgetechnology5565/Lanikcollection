"use client";
import Link from "next/link";
import { useCart, cart } from "@/lib/cart";
import { naira } from "@/lib/money";

export default function CartPage() {
  const items = useCart();
  const subtotal = items.reduce((a, i) => a + i.priceKobo * i.qty, 0);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10">
      <h1 className="font-serif text-4xl font-bold">Your cart</h1>
      {items.length === 0 ? <div className="mt-8"><p className="text-ink/60">Your cart is empty.</p><Link href="/shop" className="btn btn-gold mt-4">Continue shopping</Link></div> : (
        <>
          <ul className="mt-6 divide-y divide-champagne card">
            {items.map((i) => (
              <li key={`${i.productId}${i.size}${i.color}`} className="p-4 flex gap-4 items-center">
                <div className="flex-1"><Link href={`/product/${i.slug}`} className="font-serif text-lg hover:text-bronze">{i.name}</Link>
                  <p className="text-sm text-ink/60">{[i.size, i.color].filter(Boolean).join(" · ")}</p></div>
                <div className="inline-flex border border-ink text-sm"><button className="px-2.5" aria-label="Decrease" onClick={() => cart.setQty(i, i.qty - 1)}>−</button><span className="px-3 py-1.5">{i.qty}</span><button className="px-2.5" aria-label="Increase" onClick={() => cart.setQty(i, i.qty + 1)}>+</button></div>
                <p className="w-28 text-right font-semibold">{naira(i.priceKobo * i.qty)}</p>
                <button className="text-sm text-red-700 hover:underline" onClick={() => cart.remove(i)}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col items-end gap-2">
            <p className="text-lg">Subtotal: <b>{naira(subtotal)}</b></p>
            <p className="text-xs text-ink/60">Final prices (wholesale tiers), shipping and discounts are confirmed at checkout.</p>
            <Link href="/checkout" className="btn btn-gold">Checkout</Link>
          </div>
        </>
      )}
    </div>
  );
}
