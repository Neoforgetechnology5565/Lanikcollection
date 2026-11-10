"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cart } from "@/lib/cart";

type P = { id: number; slug: string; name: string; priceKobo: number; sizes: string[]; colors: string[]; stock: number; image?: string };
export function AddToCart({ p }: { p: P }) {
  const router = useRouter();
  const [size, setSize] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0] : null);
  const [color, setColor] = useState<string | null>(p.colors.length === 1 ? p.colors[0] : null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState("");
  const out = p.stock <= 0;

  function add(go: boolean) {
    if (p.sizes.length && !size) return setErr("Please choose a size");
    if (p.colors.length && !color) return setErr("Please choose a colour");
    cart.add({ productId: p.id, slug: p.slug, name: p.name, priceKobo: p.priceKobo, size, color, qty, image: p.image });
    setErr(""); if (go) router.push("/checkout"); else router.push("/cart");
  }
  const chip = (on: boolean) => `btn !py-1.5 !px-3 ${on ? "btn-dark" : "btn-line"}`;
  return (
    <div className="mt-6 space-y-4">
      {p.sizes.length > 0 && <div><span className="label">Size</span><div className="flex flex-wrap gap-2">{p.sizes.map((s) => <button key={s} type="button" className={chip(size === s)} onClick={() => setSize(s)}>{s}</button>)}</div></div>}
      {p.colors.length > 0 && <div><span className="label">Colour</span><div className="flex flex-wrap gap-2">{p.colors.map((c) => <button key={c} type="button" className={chip(color === c)} onClick={() => setColor(c)}>{c}</button>)}</div></div>}
      <div><span className="label">Quantity</span>
        <div className="inline-flex border border-ink"><button type="button" className="px-3" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
          <span className="px-4 py-2 min-w-10 text-center">{qty}</span><button type="button" className="px-3" onClick={() => setQty(Math.min(p.stock || 1, qty + 1))}>+</button></div></div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      <div className="flex gap-3 flex-wrap">
        <button className="btn btn-dark" disabled={out} onClick={() => add(false)}>Add to cart</button>
        <button className="btn btn-gold" disabled={out} onClick={() => add(true)}>Buy now</button>
      </div>
    </div>
  );
}
