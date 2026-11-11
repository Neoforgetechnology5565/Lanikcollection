"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { naira } from "@/lib/money";
import { Logo } from "./Logo";
import type { MenuGroup } from "@/lib/menu";

type Sug = { id: number; slug: string; name: string; priceKobo: number; saleKobo: number | null };
const I = (d: string) => <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const icons = {
  search: I("M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3"),
  user: I("M20 21v-1a6 6 0 00-6-6h-4a6 6 0 00-6 6v1M12 11a4 4 0 100-8 4 4 0 000 8z"),
  heart: I("M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5.5 6.2 5.5c1.9 0 3.2 1 3.8 2.1.6-1.1 1.9-2.1 3.8-2.1 3.2 0 5 3.1 3.7 6.3C19.5 16.4 12 21 12 21z"),
  bag: I("M6 7h12l1 13H5L6 7zM9 7a3 3 0 016 0"),
  menu: I("M4 7h16M4 12h16M4 17h16"), close: I("M6 6l12 12M18 6L6 18"),
};
const Badge = ({ n }: { n: number }) => n > 0 ? <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-ink text-[10px] font-bold flex items-center justify-center">{n}</span> : null;
const link = "text-[12px] font-semibold tracking-[.18em] uppercase hover:text-bronze transition relative after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 hover:after:w-full after:bg-gold after:transition-all";

export function Header({ groups, hasOffers, signedIn, announcement, logoUrl }: { groups: MenuGroup[]; hasOffers: boolean; signedIn: boolean; announcement: string; logoUrl?: string }) {
  const router = useRouter(); const path = usePathname();
  const cartN = useCart().reduce((a, i) => a + i.qty, 0);
  const wishN = useWishlist().length;
  const [open, setOpen] = useState(false);          // mobile drawer
  const [shop, setShop] = useState(false);          // desktop Shop dropdown
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState(""); const [sug, setSug] = useState<Sug[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shopBox = useRef<HTMLDivElement>(null);

  useEffect(() => { setShop(false); setOpen(false); setSearching(false); }, [path]);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 8); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setSug([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: c.signal }).then((r) => r.json()).then(setSug).catch(() => {}), 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
  useEffect(() => { if (searching) input.current?.focus(); }, [searching]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { setSearching(false); setOpen(false); setShop(false); } };
    const click = (e: MouseEvent) => { if (shopBox.current && !shopBox.current.contains(e.target as Node)) setShop(false); };
    window.addEventListener("keydown", k); document.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("mousedown", click); };
  }, []);
  useEffect(() => { document.body.style.overflow = open || searching ? "hidden" : ""; }, [open, searching]);

  const go = (e: React.FormEvent) => { e.preventDefault(); setSearching(false); router.push(`/shop?q=${encodeURIComponent(q)}`); };
  const top: [string, string][] = [["New In", "/shop?sort=newest"], ...(hasOffers ? [["Offers", "/shop?sale=1"] as [string, string]] : []), ["About", "/about"]];

  return (
    <>
      <div className="bg-ink text-gold-light text-center text-[11px] tracking-[.25em] py-2 uppercase px-2">{announcement}</div>
      <header className={`sticky top-0 z-40 bg-ivory/95 backdrop-blur-md transition-shadow ${scrolled ? "shadow-[0_1px_0_#e9d5b5,0_8px_24px_-16px_rgba(11,9,7,.3)]" : "border-b border-champagne/70"}`}>
        <div className="mx-auto max-w-7xl px-4 h-[68px] grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center gap-2">
            <button className="lg:hidden -ml-2 p-2" aria-label="Open menu" onClick={() => setOpen(true)}>{icons.menu}</button>
            <nav className="hidden lg:flex items-center gap-7" aria-label="Primary">
              <div ref={shopBox} className="relative" onMouseEnter={() => setShop(true)} onMouseLeave={() => setShop(false)}>
                <button type="button" className={`${link} inline-flex items-center gap-1.5 py-6`} aria-expanded={shop} aria-haspopup="true" aria-controls="shop-menu" onClick={() => setShop((v) => !v)}>
                  Shop <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 transition ${shop ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 4l4 4 4-4" /></svg>
                </button>
                {shop && (
                  <div id="shop-menu" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setShop(false); }} className="absolute left-0 top-full -ml-4 w-[min(760px,92vw)] bg-ivory border border-champagne shadow-2xl shadow-ink/20 p-8 grid gap-8 grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
                    {groups.map((g) => (
                      <div key={g.name}>
                        <p className="eyebrow">{g.name}</p><div className="rule my-2" />
                        <ul className="space-y-2">{g.items.map((i) => <li key={i.slug}><Link href={`/shop?cat=${i.slug}`} className="font-serif text-lg hover:text-bronze">{i.name}</Link></li>)}</ul>
                      </div>))}
                    <div className="col-span-full border-t border-champagne pt-4 flex gap-6 text-xs font-semibold tracking-[.18em] uppercase">
                      <Link href="/shop" className="hover:text-bronze">Shop all →</Link>
                      <Link href="/shop?sort=newest" className="hover:text-bronze">New in</Link>
                      {hasOffers && <Link href="/shop?sale=1" className="hover:text-bronze">Offers</Link>}
                    </div>
                  </div>)}
              </div>
              {top.map(([l, h]) => <Link key={h} href={h} className={link}>{l}</Link>)}
            </nav>
          </div>
          <Link href="/" aria-label="LANIK COLLECTIONS home" className="justify-self-center"><Logo size="md" src={logoUrl} /></Link>
          <div className="flex items-center justify-end gap-4">
            <Link href="/wholesale" className="hidden lg:inline-flex text-[11px] font-bold tracking-[.18em] uppercase border border-gold text-bronze px-3 py-1.5 hover:bg-ink hover:text-gold-light transition">Wholesale</Link>
            <button aria-label="Search" onClick={() => setSearching(true)} className="hover:text-bronze">{icons.search}</button>
            <Link aria-label={signedIn ? "My account" : "Sign in"} href={signedIn ? "/account" : "/account/login"} className="hidden sm:block hover:text-bronze">{icons.user}</Link>
            <Link aria-label="Wishlist" href="/wishlist" className="relative hidden sm:block hover:text-bronze">{icons.heart}<Badge n={wishN} /></Link>
            <Link aria-label={`Cart, ${cartN} items`} href="/cart" className="relative hover:text-bronze">{icons.bag}<Badge n={cartN} /></Link>
          </div>
        </div>
      </header>

      {searching && (
        <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm" onClick={() => setSearching(false)}>
          <div className="bg-ivory" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={go} className="mx-auto max-w-3xl px-4 py-6" role="search">
              <div className="flex items-center gap-3 border-b-2 border-gold pb-2">
                {icons.search}
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search perfumes, boxers, polos, jeans…" className="flex-1 bg-transparent text-xl font-serif outline-none" aria-label="Search products" autoComplete="off" />
                <button type="button" aria-label="Close search" onClick={() => setSearching(false)}>{icons.close}</button>
              </div>
              {sug.length > 0 && <ul className="mt-3 divide-y divide-champagne">{sug.map((s) => (
                <li key={s.id}><Link href={`/product/${s.slug}`} onClick={() => setSearching(false)} className="flex justify-between py-3 hover:text-bronze"><span className="font-serif text-lg">{s.name}</span><span className="text-sm">{naira(s.saleKobo && s.saleKobo < s.priceKobo ? s.saleKobo : s.priceKobo)}</span></Link></li>))}
                <li className="pt-3"><button className="text-xs uppercase tracking-widest text-bronze">See all results →</button></li></ul>}
              {q.trim().length >= 2 && sug.length === 0 && <p className="mt-4 text-sm text-ink/60">Press Enter to search for “{q}”.</p>}
            </form>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <div onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }} className="absolute left-0 top-0 h-full w-[86%] max-w-sm bg-ink text-champagne p-6 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between"><Logo dark size="sm" /><button aria-label="Close menu" onClick={() => setOpen(false)}>{icons.close}</button></div>
            <nav className="mt-6 font-serif text-2xl">
              <details className="border-b border-white/10" open>
                <summary className="py-3 cursor-pointer list-none flex justify-between items-center">Shop <span className="text-gold text-base" aria-hidden="true">▾</span></summary>
                <div className="pb-3 pl-1 space-y-4">
                  {groups.map((g) => (
                    <div key={g.name}><p className="text-[10px] font-sans tracking-[.3em] uppercase text-gold-light/80 mb-1">{g.name}</p>
                      <ul className="space-y-0.5">{g.items.map((i) => <li key={i.slug}><Link href={`/shop?cat=${i.slug}`} className="block py-1.5 text-xl text-champagne/90 hover:text-gold-light">{i.name}</Link></li>)}</ul></div>))}
                  <Link href="/shop" className="block text-sm font-sans tracking-[.2em] uppercase text-gold-light pt-1">Shop all →</Link>
                </div>
              </details>
              {top.map(([l, h]) => <Link key={h} href={h} className="block py-3 border-b border-white/10 hover:text-gold-light">{l}</Link>)}
              <Link href="/wholesale" className="block py-3 border-b border-white/10 text-gold-light">Wholesale</Link>
              <Link href="/wishlist" className="block py-3 border-b border-white/10 hover:text-gold-light">Wishlist</Link>
              <Link href={signedIn ? "/account" : "/account/login"} className="block py-3 border-b border-white/10 hover:text-gold-light">{signedIn ? "My account" : "Sign in"}</Link>
              <Link href="/track" className="block py-3 hover:text-gold-light">Track order</Link>
            </nav>
            <p className="mt-auto pt-6 text-xs text-champagne/50 tracking-widest uppercase">Quality Fashion · Fragrance · Lifestyle</p>
          </div>
        </div>
      )}
    </>
  );
}
