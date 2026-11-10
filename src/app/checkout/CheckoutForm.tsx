"use client";
import { useState } from "react";
import Link from "next/link";
import { useCart, cart } from "@/lib/cart";
import { naira } from "@/lib/money";
import type { Method } from "@/lib/methods";
import { MethodPicker } from "@/components/MethodPicker";

const STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];

export function CheckoutForm({ methods, shippingKobo }: { methods: Method[]; shippingKobo: number }) {
  const items = useCart();
  const [method, setMethod] = useState<Method | "">(methods[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const subtotal = items.reduce((a, i) => a + i.priceKobo * i.qty, 0);

  if (!items.length) return <div className="mt-8"><p className="text-ink/60">Your cart is empty.</p><Link href="/shop" className="btn btn-gold mt-4">Shop now</Link></div>;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    if (!method) return setError("Choose a payment method");
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: f.get("name"), email: f.get("email"), phone: f.get("phone"), address: f.get("address"),
          city: f.get("city"), state: f.get("state"), notes: f.get("notes") || null, discountCode: f.get("code") || null, method,
          items: items.map((i) => ({ productId: i.productId, size: i.size, color: i.color, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (res.ok) { cart.clear(); window.location.href = data.next; return; }
      if (data.orderUrl) { cart.clear(); window.location.href = `${data.orderUrl}&err=${encodeURIComponent(data.error)}`; return; }
      setError(data.error ?? "Something went wrong");
    } catch { setError("Network error. Please try again."); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 grid md:grid-cols-5 gap-8">
      <div className="md:col-span-3 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required minLength={2} className="input" autoComplete="name" /></div>
          <div><label className="label" htmlFor="phone">Phone</label><input id="phone" name="phone" required type="tel" className="input" autoComplete="tel" /></div>
        </div>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" required type="email" className="input" autoComplete="email" /></div>
        <div><label className="label" htmlFor="address">Delivery address</label><input id="address" name="address" required minLength={5} className="input" autoComplete="street-address" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="city">City</label><input id="city" name="city" required className="input" autoComplete="address-level2" /></div>
          <div><label className="label" htmlFor="state">State</label><select id="state" name="state" required className="input" defaultValue="">
            <option value="" disabled>Select state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div><label className="label" htmlFor="notes">Delivery instructions (optional)</label><textarea id="notes" name="notes" rows={2} className="input" /></div>
        <div><span className="label">Payment method</span><MethodPicker methods={methods} value={method} onChange={setMethod} /></div>
      </div>
      <aside className="md:col-span-2 card p-5 h-fit space-y-3">
        <h2 className="font-serif text-xl font-bold">Order summary</h2>
        <ul className="text-sm divide-y divide-champagne">{items.map((i) => <li key={`${i.productId}${i.size}${i.color}`} className="py-2 flex justify-between gap-2"><span>{i.name} ×{i.qty}<br /><span className="text-ink/50">{[i.size, i.color].filter(Boolean).join(" · ")}</span></span><span>{naira(i.priceKobo * i.qty)}</span></li>)}</ul>
        <div><label className="label" htmlFor="code">Discount code</label><input id="code" name="code" className="input uppercase" /></div>
        <div className="text-sm space-y-1 border-t border-champagne pt-3">
          <p className="flex justify-between"><span>Subtotal</span><span>{naira(subtotal)}</span></p>
          <p className="flex justify-between"><span>Shipping</span><span>{naira(shippingKobo)}</span></p>
          <p className="text-xs text-ink/50">Discount and wholesale pricing are applied by the server when you place the order. The exact total is shown before you pay.</p>
        </div>
        {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
        <button className="btn btn-gold w-full" disabled={busy || !method}>{busy ? "Please wait…" : "Place order & pay"}</button>
      </aside>
    </form>
  );
}
