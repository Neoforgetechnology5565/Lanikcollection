"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cart } from "@/lib/cart";

type V = { size: string; color: string; stock: number };
type P = { id: number; slug: string; name: string; priceKobo: number; sizes: string[]; colors: string[]; variants: V[]; image?: string };

export function AddToCart({ p }: { p: P }) {
  const router = useRouter();
  const [size, setSize] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0] : null);
  const [color, setColor] = useState<string | null>(p.colors.length === 1 ? p.colors[0] : null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState("");

  const stockOf = (s: string | null, c: string | null) => p.variants.filter((v) => (s == null || v.size === s) && (c == null || v.color === c)).reduce((a, v) => a + v.stock, 0);
  const sizeOk = (s: string) => stockOf(s, color) > 0;       // a size is offered if some (chosen-colour) variant has stock
  const colorOk = (c: string) => stockOf(size, c) > 0;
  const ready = (!p.sizes.length || size) && (!p.colors.length || color);
  const avail = ready ? stockOf(p.sizes.length ? size : "", p.colors.length ? color : "") : stockOf(null, null);
  const soldOutAll = stockOf(null, null) <= 0;

  function pick(kind: "s" | "c", v: string) {
    const ns = kind === "s" ? v : size, nc = kind === "c" ? v : color;
    if (kind === "s") setSize(v); else setColor(v);
    setErr(""); setQty(1);
    // drop the other choice if that combination is sold out
    if (kind === "s" && nc && stockOf(ns, nc) <= 0) setColor(null);
    if (kind === "c" && ns && stockOf(ns, nc) <= 0) setSize(null);
  }
  function add(go: boolean) {
    if (p.sizes.length && !size) return setErr("Please choose a size");
    if (p.colors.length && !color) return setErr("Please choose a colour");
    if (avail <= 0) return setErr("That option is sold out");
    cart.add({ productId: p.id, slug: p.slug, name: p.name, priceKobo: p.priceKobo, size, color, qty: Math.min(qty, avail), image: p.image });
    router.push(go ? "/checkout" : "/cart");
  }
  const chip = (on: boolean, off: boolean) => `btn !py-1.5 !px-3 ${on ? "btn-dark" : "btn-line"} ${off ? "!opacity-35 line-through" : ""}`;
  return (
    <div className="mt-6 space-y-4">
      {p.sizes.length > 0 && <div><span className="label">Size</span><div className="flex flex-wrap gap-2">{p.sizes.map((s) => <button key={s} type="button" disabled={!sizeOk(s)} aria-pressed={size === s} className={chip(size === s, !sizeOk(s))} onClick={() => pick("s", s)}>{s}</button>)}</div></div>}
      {p.colors.length > 0 && <div><span className="label">Colour</span><div className="flex flex-wrap gap-2">{p.colors.map((c) => <button key={c} type="button" disabled={!colorOk(c)} aria-pressed={color === c} className={chip(color === c, !colorOk(c))} onClick={() => pick("c", c)}>{c}</button>)}</div></div>}
      {ready && avail > 0 && avail <= 5 && <p className="text-sm font-semibold text-amber-700">Only {avail} left in this option</p>}
      <div><span className="label">Quantity</span>
        <div className="inline-flex border border-ink"><button type="button" className="px-3" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
          <span className="px-4 py-2 min-w-10 text-center">{qty}</span><button type="button" className="px-3" onClick={() => setQty(Math.min(Math.max(avail, 1), qty + 1))}>+</button></div></div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      <div className="flex gap-3 flex-wrap">
        <button className="btn btn-dark" disabled={soldOutAll} onClick={() => add(false)}>{soldOutAll ? "Sold out" : "Add to cart"}</button>
        <button className="btn btn-gold" disabled={soldOutAll} onClick={() => add(true)}>Buy now</button>
      </div>
    </div>
  );
}
